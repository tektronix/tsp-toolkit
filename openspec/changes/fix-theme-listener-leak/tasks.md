# Tasks

## 1. Register the theme listener once

- [ ] 1.1 In `src/baseSessionManager.ts`, make `setupThemeChangeListener()` return the `vscode.Disposable` from `vscode.window.onDidChangeActiveColorTheme`, call it from the constructor after `listenToConfigChanges()`, and push the result to `this.context.subscriptions`. Keep the `this.panel && this.child` check in the listener body. Verify with `npm run compile`.
- [ ] 1.2 Remove the `setupThemeChangeListener()` call from `openPanel()`. Verify by searching `src/` that `setupThemeChangeListener` is called only from the constructor, and that `onDidChangeActiveColorTheme` appears only inside it.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: closing and reopening a Script Generation or TriggerFlow panel no longer makes each theme change refresh that panel several times. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension", watching the "Sent theme refresh signal" lines in the Debug Console. (a) Open a script generation session and switch theme: one line appears. (b) Close and reopen the panel three times, then switch theme: still one line. (c) Close the panel and switch theme: no line appears. (d) Repeat (a) and (b) for TriggerFlow. Record the results.
- [ ] 3.3 If `fix-tool-panel-load-failure` was applied first, confirm that its reworked `openPanel()` no longer calls `setupThemeChangeListener()`. Verify by reading `openPanel()` after both changes are applied.
- [ ] 3.4 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-backends/spec.md` exists. Compare its "Theme changes" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-theme-listener-leak`.
