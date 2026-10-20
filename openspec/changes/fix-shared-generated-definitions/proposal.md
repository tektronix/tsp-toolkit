# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation: VS Code
windows overwrite each other's definitions. The files shipped in the instrument-library
package are only read. The per-node and per-slot definitions generated from the active
system, and `commonTables.lua`, are written to one `nodes_definitions` folder inside that
installed package. There is one installed copy of the extension, so every window points
its `Lua.workspace.library` at the same folder. When a window with a different active
system regenerates, it empties and rewrites that folder, and the other windows' language
servers start reporting the wrong nodes and slots. It also means the extension needs
write access to its own install directory.

## What Changes

- Generated definitions are written to a folder in the extension's storage for the current
  workspace, which VS Code provides per workspace, instead of inside the installed
  package. Windows with different workspaces no longer share the folder.
- `Lua.workspace.library` points at that per-workspace folder. Everything else in the list
  (the base library and each model's `Helper` and `AllTspCommands`) still points into the
  installed package, which is still only read.
- Existing workspaces move to the new folder automatically, because activation already
  regenerates the libraries and rewrites the setting.
- If VS Code provides no workspace storage (no folder open), the libraries are not
  regenerated, which matches the existing rule that the Lua settings are written only when
  a folder is open.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-language-workspace`: "Generated-definitions folder" moves the folder to the
  extension's per-workspace storage. "Updating the library setting" no longer says every
  path points into the installed extension.

## Impact

- Code: `src/workspaceManager.ts` (the folder path and how it is provided) and
  `src/extension.ts` (passing `context.storageUri` in during activation).
  `SUPPORTED_MODELS_DETAILS` in `src/resourceManager.ts` keeps excluding
  `nodes_definitions`, so a folder left behind in a development checkout isn't offered as
  a model.
- User-visible: two windows with different active systems each get completion for their
  own system.
- `fix-overlapping-lua-regeneration` also changes `src/workspaceManager.ts`, but modifies
  different requirements. Whichever is implemented second must rebase onto the other's
  code.
- `tsp-language-workspace` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
