# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation: merged
settings are copied between scopes. When the extension writes an object-valued setting
(`files.associations` to user settings, `Lua.runtime.builtin` to workspace settings),
`updateConfiguration()` merges its keys into the **effective** value, which VS Code
combines from user, workspace, and folder settings. It then writes the result to one
target. Keys that belong to another scope are copied into the target. For example, a
`*.foo` association defined only in a workspace is copied into user settings on
activation, and from then on it applies to every workspace.

## What Changes

- Object-valued settings are merged only with the value already stored at the target
  being written. Keys from other scopes are never copied.
- Keys at the target that the extension doesn't set are still kept, as today.
- Non-object settings are unchanged: they are still written as given, replacing any value
  at the target.
- Settings already copied by earlier versions are left alone. The extension can't tell a
  copied key from one the user added.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-language-workspace`: "TSP file associations" and "Lua runtime settings" say the
  merge uses only the value at the target scope.

## Impact

- Code: `updateConfiguration()` in `src/workspaceManager.ts`. Its only object-valued
  callers are the two above, so no caller changes.
- `fix-overlapping-lua-regeneration` and `fix-shared-generated-definitions` also change
  `src/workspaceManager.ts`, in different functions.
- `tsp-language-workspace` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
