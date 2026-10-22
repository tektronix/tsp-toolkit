# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
manual links assume one module. Every "open manual" request from a tool's panel opens a
page under `MSMU60-2/`, whatever modules the user's system contains. A user with an
MPSU50-2ST or MSMU200-2 sees the MSMU60-2 page for the block. A block name that isn't in
the built-in map opens `MSMU60-2/undefined`, which the help panel shows as
"Not Found doc/MSMU60-2/undefined".

## What Changes

- The help folder is chosen from the active TSP-Link system. The extension uses the
  first slot module of that system, in slot order, whose help folder contains the page
  for the block. When no slot module has the page, it falls back to `MSMU60-2`, as today.
- A block name that isn't in the map shows the information message
  `No manual page is available for <block>.` and opens nothing.
- The block-to-page map and the help panel itself don't change.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-backends`: "Opening the manual for a block" picks the help folder from the active
  system's slot modules and reports unknown blocks.

## Impact

- Code: `openManual()` in `src/baseSessionManager.ts`. It needs the active system, which
  the manager already loads into `existingSystems`, and `WEB_HELP_FILE_PATH` from
  `@tektronix/web-help-documents` to check whether a page exists.
- `src/helpDocumentWebView.ts` doesn't change. It still receives a
  `<folder>/<page>` path through `kic.viewHelpDocument`.
- The OPEN_MANUAL payload doesn't name the module or channel the block belongs to, so in a
  system with more than one kind of module the extension can only guess. `design.md`
  records a backend change that would remove the guess as a follow-up.
- `tool-backends` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
