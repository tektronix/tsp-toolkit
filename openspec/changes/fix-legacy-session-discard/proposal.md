# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
legacy sessions can be discarded. On activation, sessions in the legacy
`tsp.script_generation` setting are migrated to `tsp.scriptGenSessions` or
`tsp.triggerFlowSessions` only when the new setting holds no sessions for that tool. If
it already holds even one, the legacy sessions for that tool are skipped, but the legacy
setting is still removed. Those sessions are then lost without any message. This happens,
for example, when a user creates a new session in a newer version before the workspace
that holds legacy sessions has been migrated, or when legacy entries are restored into a
workspace that already uses the new settings.

## What Changes

- Migration merges instead of skipping. For each tool, every legacy session whose name is
  not in the new setting is appended to it, in legacy order. Sessions already in the new
  setting are never changed.
- A legacy session with the same name and the same `config` as a session in the new
  setting counts as migrated.
- A legacy session with the same name but a different `config` is a conflict. It is not
  migrated and stays in `tsp.script_generation`. Only conflicting sessions stay there.
  The legacy setting is removed once nothing is left in it.
- While conflicts remain, each activation shows a warning that names them and offers to
  open the workspace settings file, so the user can rename or delete one copy.
- The new setting is written only when at least one session is appended.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-sessions`: "Legacy session migration" merges legacy sessions into the new
  settings, keeps conflicting sessions in the legacy setting, and warns about them.

## Impact

- Code: `GenericSessionStorage.migrateLegacySessions()` in `src/genericSessionStorage.ts`,
  plus a new file that doesn't import `vscode`, holding the merge logic so plain mocha can
  test it. The call site in `activate()` in `src/extension.ts` doesn't change.
- Reset to Defaults still leaves `tsp.script_generation` alone, so conflicting sessions
  left there can only be resolved by editing settings. The warning says so.
- `fix-tool-session-scope-copy` changes how `GenericSessionStorage` reads the new
  settings, but leaves migration as it is. Whichever change lands second should make
  migration read the new settings the same way the rest of the storage does.
  `fix-tool-session-write-race` also changes `GenericSessionStorage`, in the add, update,
  and remove paths. Migration runs before any session manager exists, so the two don't
  interact.
- `tool-sessions` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
