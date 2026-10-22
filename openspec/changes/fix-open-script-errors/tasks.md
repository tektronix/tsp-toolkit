# Tasks

## 1. Report open failures

- [ ] 1.1 In `src/baseSessionManager.ts`, make `openGeneratedScript()` `async` and call it as `void this.openGeneratedScript()` from the `OPEN_SCRIPT` case of `handleWebviewMessage()`. Keep the no-folder and no-session checks, the path, and the already-visible check unchanged. Verify with `npm run compile`.
- [ ] 1.2 In `openGeneratedScript()`, before opening, `await vscode.workspace.fs.stat(scriptUri)`. If it throws a `vscode.FileSystemError` with code `FileNotFound`, show `Script not found: ${scriptPath}` with `showErrorMessage` and return. Let any other `stat` error fall through to the open attempt. Verify with `npm run compile` and by reading the diff.
- [ ] 1.3 Replace `void vscode.window.showTextDocument(...)` with `await vscode.window.showTextDocument(...)` inside the existing `try`, so the existing `catch` shows "Failed to open script: `<path>`. Error: `<message>`". Verify by searching `src/baseSessionManager.ts` that `showTextDocument` is no longer preceded by `void`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: opening the generated script from a Script Generation or TriggerFlow panel now shows an error when the script is missing or can't be opened, instead of doing nothing. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Open a script generation session whose script has been generated and use the panel's open-script action: the script opens beside the panel. (b) Use it again while the script is visible: nothing new opens. (c) Close the script, delete or rename `<session>.tsp`, and use the action: "Script not found: `<path>`" is shown. (d) Repeat (a) and (c) for TriggerFlow. Record the results, or note what could not be exercised.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-backends/spec.md` exists. Compare its "Opening the generated script" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-open-script-errors`.
