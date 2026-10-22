# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
session writes are not serialized. Adding, updating, and removing a session each read the
session setting, change it, and start a write without waiting for earlier writes. The
backend reports a new session and then, often right away, an update. If the update reads
the setting before the add has landed, it can't find the session. Script generation then
drops the update, so the saved configuration is older than what the panel shows.
TriggerFlow treats the update as a new session and appends a second entry with the same
name. Two quick changes can also overwrite each other, because each writes back a copy of
the setting it read before the other finished. (Read from the code, not reproduced.)

## What Changes

- All changes to one session setting run one at a time, in the order they were requested,
  whichever part of the extension requests them. Each change reads the setting only when
  its turn comes and finishes writing before the next one starts. A failed write is logged
  and doesn't block later changes.
- The decisions that depend on what is stored are made when the change runs, not when it
  is requested: whether a reported new session replaces an existing entry, and whether an
  update finds its session. A new session is therefore never added twice, and an update
  that follows a new-session report always finds it.
- Script generation still ignores an update for a session that doesn't exist when the
  update runs. TriggerFlow still appends it.
- The Tools view refreshes, and reveals a newly added session, after the write has
  finished instead of before.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-sessions`: "Saving sessions reported by the backend" makes its checks when the
  write runs and refreshes the view afterwards. A new requirement, "Serialized session
  writes", requires changes to each session setting to run one at a time.

## Impact

- Code: `GenericSessionStorage` in `src/genericSessionStorage.ts` (`addSession()`,
  `updateSession()`, `removeSession()`, `removeAllSessions()`, and a new add-or-replace
  operation), the `saveSession()`, `updateSession()`, and `removeSession()` overrides in
  `src/scriptGenWebViewManager.ts` and `src/triggerFlowWebViewManager.ts`, and
  `deleteSession()` in `src/baseSessionManager.ts`, which waits for the write before
  refreshing the view. A new `vscode`-free helper under `src/` with a mocha test.
- Several `GenericSessionStorage` instances exist for the same setting (one in each
  manager, one in each tree provider, and short-lived ones in Reset to Defaults), so the
  queue is shared per settings key, not per instance.
- `fix-tool-session-scope-copy` also changes how `GenericSessionStorage` reads and writes
  the settings. The two changes touch the same methods and should be implemented
  compatibly: the queued operations should use whatever read and write that change
  introduces. Whichever is implemented second must rebase onto the other's code.
- `tool-sessions` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
