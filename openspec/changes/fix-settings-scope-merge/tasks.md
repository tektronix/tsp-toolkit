# Tasks

## 1. Merge with the target scope's value

- [ ] 1.1 Add a function that doesn't import `vscode`, for example `mergeAtTarget(stored: unknown, value: unknown): unknown` in a small new file under `src/`. If both `stored` and `value` are plain objects (not arrays), it returns `{ ...stored, ...value }`. Otherwise it returns `value`. Add `src/test/mergeAtTarget.test.ts` (TDD UI) covering: `stored` undefined; an object merged with an object, where the new keys win and the existing keys are kept; an array value, which is replaced; a scalar value; `stored` being an array while `value` is an object (returns `value`). Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/mergeAtTarget.test.ts`.
- [ ] 1.2 In `updateConfiguration()` in `src/workspaceManager.ts`, replace `config.get(config_name, {})` with the value stored at the target, from `config.inspect(config_name)`: `globalValue` for `Global`, `workspaceValue` for `Workspace`, and `workspaceFolderValue` for `WorkspaceFolder`. Pass it to `mergeAtTarget()`. Keep the error message on failure unchanged. Verify with `npm run compile` and by reading the diff: `config.get` is no longer used to build the written value.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: file associations and Lua runtime settings defined in one settings scope are no longer copied into another when the extension activates. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Add `"*.bar": "ini"` to the test folder's workspace `files.associations` only, and activate: user `files.associations` gains `*.tsp` and `*.tspa` but not `*.bar`. (b) Add `"*.foo": "ini"` to user `files.associations`, and activate: it is kept. (c) Set user `Lua.runtime.builtin` to `{ "lpeg": "enable" }`, and activate in a folder: workspace `Lua.runtime.builtin` doesn't contain `lpeg`. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-language-workspace/spec.md` exists. Compare its "TSP file associations" and "Lua runtime settings" requirements with this change's delta and re-apply this change's edits if the baseline text has changed. Verify with `openspec validate fix-settings-scope-merge`.
