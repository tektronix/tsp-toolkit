# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
sessions from other scopes are copied into the workspace. `GenericSessionStorage` reads
`tsp.scriptGenSessions` and `tsp.triggerFlowSessions` through `get()`, which returns the
**effective** value that VS Code merges from user and workspace settings. Every add,
update, and remove then writes that whole merged object to workspace settings. A session
defined in user settings is therefore copied into the workspace the first time any
session there changes. From then on there are two copies, and they drift apart.

Sessions belong to a workspace. Each one generates `<name>.tsp` in the first workspace
folder, and the backend is given that folder as the session's path. A session listed from
user settings in another workspace points at a script that isn't there.

## What Changes

- Sessions are read from, and written to, workspace settings only. The storage uses the
  workspace value from `inspect()` instead of the effective value.
- **Visible change:** sessions defined only in user settings are no longer listed in the
  Tools view, can't be opened, and aren't counted by Reset to Defaults. Before this
  change they were listed in every workspace.
- Sessions copied into workspace settings by earlier versions are left alone. The
  extension can't tell a copied session from one created in that workspace.
- User settings are never written, as today.
- Add a changelog entry under 1.6.0 → Fixed, which mentions that user-level sessions are
  no longer shown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-sessions`: "Session storage" says sessions are read from and written to workspace
  settings only, and that values in user settings are ignored.

## Impact

- Code: `loadSessions()` in `src/genericSessionStorage.ts`. Every other read and write in
  the storage goes through it or through `updateSettings()`, which already writes to
  workspace settings, so no other storage method changes. The Tools view providers, the
  session managers, and the Reset to Defaults options all use `GenericSessionStorage`, so
  they follow automatically.
- Reset to Defaults: the "Delete Script Generation Sessions" and "Delete TriggerFlow
  Sessions" options count only workspace sessions. With sessions only in user settings
  they are skipped as "No … sessions found." Deleting all sessions still writes an empty
  list for that tool to workspace settings and leaves user settings alone, as today.
- `migrateLegacySessions()` is left unchanged: it still reads the effective values of the
  legacy and new settings. Migration runs before any manager exists, reads the new
  settings only to decide what to merge, and already writes to workspace settings, so it
  doesn't copy user sessions into the workspace unless it migrates legacy sessions.
  `fix-legacy-session-discard` rewrites migration. Whichever change lands second should
  make migration read the new settings from the workspace value too.
- `fix-tool-session-write-race` also changes `src/genericSessionStorage.ts`, in the add,
  update, and remove paths. It should build each change on the workspace value this
  change introduces.
- This is the same pattern as `fix-settings-scope-merge`, which fixes it only for
  `updateConfiguration()` in `src/workspaceManager.ts`. The two changes don't touch the
  same code.
- `tool-sessions` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
