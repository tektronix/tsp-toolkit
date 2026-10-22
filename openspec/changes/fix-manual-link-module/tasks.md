# Tasks

## 1. Choose the help folder

- [ ] 1.1 Add a pure helper that doesn't import `vscode`, for example `chooseHelpFolder(system, page, exists)` in a new file under `src/`. It takes the active system entry (or `undefined`), the page file name, and an `exists(relativePath)` function, builds the candidate list from `design.md` (local node slots, then each remote node's slots, in stored order, each module once, `Empty` skipped), and returns the first module whose `<module>/<page>` exists, or `MSMU60-2`. Add `src/test/helpFolder.test.ts` (TDD UI) covering: no system; a system with no slots; a single MPSU50-2ST with a page it has; MPSU50-2ST in slot 1 and MSMU200-2 in slot 2 with a page only the second has; a remote node's slot module; no candidate has the page. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/helpFolder.test.ts`.
- [ ] 1.2 In `openManual()` in `src/baseSessionManager.ts`, look up the page in `blockNameandManualUrlMap`. If it's missing, show `No manual page is available for <block>.` with `vscode.window.showInformationMessage` and return. Otherwise find the entry of `existingSystems` with `isActive` set, call the helper with `exists` backed by `fs.existsSync(path.join(WEB_HELP_FILE_PATH, relativePath))`, and run `kic.viewHelpDocument` with `<folder>/<page>`, the block name, and `ViewColumn.Beside`, as today. Verify with `npm run compile`, and by reading the diff to confirm that the literal `MSMU60-2/` prefix is used only as the helper's fallback.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: script generation and TriggerFlow open the manual page for a slot module in the active system instead of always the MSMU60-2 page, and report blocks that have no manual page. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension" and a TriggerFlow session. (a) With an MP5103 system that has an MSMU60-2 in slot 1, open the manual for `MEASURE`: `MSMU60-2/114968.htm` opens. (b) Change slot 1 to MPSU50-2ST and open it again: the MPSU50-2ST page opens. (c) With only an MPSU50-2ST, open the manual for a `branch` block: the MSMU60-2 page opens. (d) If the panel can send a block name not in the map, confirm the information message; otherwise note that it could not be exercised. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-backends/spec.md` exists. Compare its "Opening the manual for a block" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-manual-link-module`.
