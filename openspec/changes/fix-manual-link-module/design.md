# Design

## Context

`openManual()` in `src/baseSessionManager.ts` runs `kic.viewHelpDocument` with
`MSMU60-2/${this.blockNameandManualUrlMap[blockName]}`. The help documents package
(`@tektronix/web-help-documents`, exported root `WEB_HELP_FILE_PATH`) ships one folder
per model and module. The three slot modules that have trigger model pages, `MSMU60-2`,
`MSMU200-2`, and `MPSU50-2ST`, use the same page ids for the same blocks. Not every module
has every page: `117325.htm` (`branch`) exists for `MSMU60-2` and `MSMU200-2` but not for
`MPSU50-2ST`. When the path doesn't exist, `helpDocumentWebView.ts` shows
"Not Found doc/<path>".

The OPEN_MANUAL payload carries only `block_name`. It doesn't say which channel or module
the block belongs to.

## Goals / Non-Goals

**Goals:**

- Open the page for a module the user actually has, when the system makes that possible.
- Never open a path built from `undefined`.

**Non-Goals:**

- Changing the block-to-page map or moving it into a catalog file.
- Changing `helpDocumentWebView.ts` or the payload format.
- Picking the exact module in a system with several kinds of module. Without more data
  from the backend that is a guess, see "Follow-up".

## Decisions

### Choose the folder from the active system's slot modules

`openManual()` builds a candidate list from the active entry of `existingSystems`: the
local node's `slots` in stored order, then each remote node's `slots` in stored order,
keeping each `module` once and skipping `Empty`. It uses the first candidate for which
`<WEB_HELP_FILE_PATH>/<module>/<page>` exists, and falls back to `MSMU60-2`.

Checking that the file exists handles modules that lack a page (as `branch` on the
MPSU50-2ST) and module names that have no help folder, without a second list of which
modules have trigger pages. The check is one `fs.existsSync` per candidate, at most a few
per click.

`existingSystems` is already reloaded whenever `tsp.tspLinkSystemConfigurations` changes,
so the manager doesn't need a new listener.

Alternatives considered:

- **Always use the first slot module.** Simpler, but opens "Not Found" for `branch` on an
  MPSU50-2ST system even when another module in the system has the page.
- **Keep MSMU60-2 and only fix unknown blocks.** Leaves users of other modules reading the
  wrong module's manual, which is the reported deviation.

### Systems with more than one kind of module

In an MP5103 with, for example, an MPSU50-2ST in slot 1 and an MSMU60-2 in slot 2, a
`MEASURE` block on the MSMU60-2 channel opens the MPSU50-2ST page, because slot 1 comes
first. The pages for the same block describe the same trigger model block, so this is a
reasonable page, just not always the exact one. This limit is accepted until the backend
sends the channel.

### Report unknown blocks

When `block_name` isn't in the map, `openManual()` shows
`No manual page is available for <block>.` with `showInformationMessage` and returns. A
message is better than a silent no-op, because the user clicked something and expects a
result.

## Follow-up

**Backend sends the module.** The best fix is for the script-gen and trigger-flow backends
to include the module (or channel, from which the extension can find the slot) in the
OPEN_MANUAL payload, for example `{"block_name": "MEASURE", "module": "MSMU60-2"}`. The
extension would then use that module first and fall back to the slot-order rule above.
This needs a release of both backend packages, so it's left as an open question for the
backend owners. The rule in this change stays correct as the fallback when the payload
doesn't name a module.

## Risks / Trade-offs

- [The chosen module may not be the block's module in mixed systems] → Accepted; see the
  section above and the follow-up.
- [Help folders may be renamed in a future package] → The existence check falls back to
  `MSMU60-2`, which is no worse than today.
