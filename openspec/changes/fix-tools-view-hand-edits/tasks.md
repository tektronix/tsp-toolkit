# Tasks

## 1. Refresh on session setting changes

- [ ] 1.1 In `listenToConfigChanges()` in `src/scriptGenWebViewManager.ts`, also call `refreshDataProvider()` when `event.affectsConfiguration("tsp.scriptGenSessions")`, without reloading or sending the system configuration for that case. Push the disposable returned by `onDidChangeConfiguration` onto `this.context.subscriptions`. Verify with `npm run compile`, and by reading the diff to confirm that a session-setting change doesn't send anything to the backend.
- [ ] 1.2 Make the same change in `src/triggerFlowWebViewManager.ts` for `tsp.triggerFlowSessions`. Verify with `npm run compile`.
- [ ] 1.3 Confirm by reading `handleWebviewMessage()`, `updateSession()`, and `setActiveStatus()` that removing the open session's entry neither closes the panel nor clears `sessionName`, so the behavior in the spec's "Open session removed by hand" scenario needs no further code. Verify by recording the conclusion in the pull request description.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: the Tools view now shows script generation and TriggerFlow sessions added, renamed, or removed directly in the settings. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Rename a script generation session in `.vscode/settings.json` and save: the Tools view shows the new name right away. (b) Add a TriggerFlow session entry by hand: it appears under the TriggerFlow node. (c) With a TriggerFlow session open, delete its entry by hand: the item disappears and the panel stays open. (d) Create a new session through the UI: it still appears and is selected once, with no flicker beyond the extra refresh. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-sessions/spec.md` exists. Compare its "Tools view" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-tools-view-hand-edits`.
