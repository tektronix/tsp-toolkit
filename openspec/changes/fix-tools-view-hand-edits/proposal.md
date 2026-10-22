# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation: hand
edits are not shown. The Tools view refreshes only after the extension changes a session
itself, or after `tsp.tspLinkSystemConfigurations` or `tsp.lineFrequency` changes. If the
user edits `tsp.scriptGenSessions` or `tsp.triggerFlowSessions` in `settings.json`, for
example to rename or remove a session, or a sync or source-control checkout changes the
workspace settings, the view keeps showing the old list until something unrelated
refreshes it.

## What Changes

- The Tools view refreshes whenever `tsp.scriptGenSessions` or `tsp.triggerFlowSessions`
  changes, however it was changed.
- Removing the open session's entry by hand removes its item from the view, but doesn't
  close the panel or change the tool's current session. What happens to later updates
  from the backend is unchanged.
- The extension's own writes also trigger the refresh. That extra refresh has no visible
  effect.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-sessions`: "Tools view" refreshes after any change to either session setting and
  says what happens when the open session's entry is removed by hand.

## Impact

- Code: `listenToConfigChanges()` in `src/scriptGenWebViewManager.ts` and
  `src/triggerFlowWebViewManager.ts`, which already listen for configuration changes and
  call `refreshDataProvider()`. The listener disposables are added to
  `context.subscriptions`, which the current listeners don't do.
- `GenericSessionDataProvider` reads the setting on every `getChildren()` call, so a
  refresh is enough to show the new list.
- `fix-tool-session-scope-copy` changes which scope sessions are read from.
  The refresh in this change applies either way.
- `tool-sessions` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
