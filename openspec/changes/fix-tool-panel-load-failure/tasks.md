# Tasks

## 1. Handle closing from the start

- [ ] 1.1 In `openPanel()` in `src/baseSessionManager.ts`, call `setupPanelDisposal()` right after `createWebviewPanel()` and `setWebviewIcon()`, and remove the call after a successful load. Keep `setupWebviewMessageListener()` and `setupThemeChangeListener()` after the load. Verify with `npm run compile`, and by reading `openPanel()` to confirm that `setupPanelDisposal()` runs exactly once per created panel.
- [ ] 1.2 In the same function, keep the created panel in a local variable. After `checkServerReady()` resolves or rejects, and after `loadWebviewContent()`, return without touching the panel or registering listeners if `this.panel !== panel`. Pass the local panel, not `this.panel`, to `loadWebviewContent()` and `handleError()`. Verify with `npm run compile`, and by reading the diff: no code path writes `webview.html` to a panel after it has been closed.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: after a Script Generation or TriggerFlow panel fails to load, closing it and opening the tool again now retries, instead of leaving the tool unusable until VS Code is reloaded. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". Make the load fail, for example by temporarily pointing the script generation executable at a program that does not serve port 27950, or by occupying the port with a server that returns an error. (a) Open a session: after 10 seconds the panel shows "Error starting server or loading content". (b) Close it: the session is no longer marked active in the Tools view. (c) Open the session again: a new panel appears and waits again. (d) Close a panel during the wait: no error appears in the Extension Host log about a disposed webview. (e) With the backend restored, open, close, and reopen each tool: both load normally. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-backends/spec.md` exists. Compare its "Opening a tool panel" and "Closing the panel and deactivating" requirements with this change's delta and re-apply this change's edits if the baseline text has changed. If `fix-tool-port-conflict` was archived first, re-apply this change's edits to "Opening a tool panel" on top of its text. Verify with `openspec validate fix-tool-panel-load-failure`.
