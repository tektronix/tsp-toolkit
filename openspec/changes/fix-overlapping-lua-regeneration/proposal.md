# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation:
regenerations overlap. Every change to `tsp.tspLinkSystemConfigurations` starts a full
regeneration with no serialization, and a single user action often writes the setting more
than once. Adding a system writes the list and then writes it again to activate it, and in
edit mode every dropdown change writes. The overlapping runs clear the same
generated-definitions folder, append to the same `commonTables.lua`, and each waits 2
seconds before setting `Lua.workspace.library`. The final library list and table file
therefore depend on timing, and can describe an older system or hold duplicate tables.

## What Changes

- Only one regeneration runs at a time in a window.
- A change to the setting while a regeneration is running does not start a second run.
  The extension records that another run is needed and, once the current run finishes,
  runs once more using the setting as it is then. Any number of changes during a run
  result in a single follow-up run.
- The steps of a regeneration don't change. Each run still empties
  `Lua.workspace.library`, writes the definitions, waits 2 seconds, and sets the full list.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-language-workspace`: "When Lua libraries are regenerated" replaces "each change
  starts its own regeneration" with one run at a time plus a single follow-up run.

## Impact

- Code: `src/workspaceManager.ts` (`updateLuaLibraryConfigurations()` and a new entry
  point), the configuration listener in `src/ConifgWebView.ts`, and
  `configure_initial_workspace_configurations()`. Both callers go through the new entry
  point.
- This change does not reduce how often the view writes the setting. Fewer writes would
  also help, but serializing the runs makes the result correct whatever the write
  pattern.
- `fix-shared-generated-definitions` also changes `src/workspaceManager.ts`, but modifies
  different requirements. Whichever is implemented second must rebase onto the other's
  code.
- `tsp-language-workspace` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
