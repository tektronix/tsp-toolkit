# Tasks

## 1. Serialize regenerations

- [ ] 1.1 Add a `createSingleFlight(run: () => Promise<void>): () => Promise<void>` helper in a new file under `src/` that doesn't import `vscode`, implementing the runner from `design.md`: one in-flight run, a `pending` flag, and exactly one follow-up run when `pending` is set, including after a run that rejects. Add `src/test/singleFlight.test.ts` (TDD UI) covering: requests made while a run is in flight produce exactly one follow-up run; there is no follow-up when nothing was requested during a run; a run that rejects still triggers the pending follow-up; a request after everything settles starts a new run. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/singleFlight.test.ts`.
- [ ] 1.2 In `src/workspaceManager.ts`, export `requestLuaLibraryRegeneration = createSingleFlight(updateLuaLibraryConfigurations)` and make `updateLuaLibraryConfigurations()` module-private. Switch both callers to it: the `onDidChangeConfiguration` listener in the `ConfigWebView` constructor (`src/ConifgWebView.ts`) and `configure_initial_workspace_configurations()`. Verify with `npm run compile`, and search `src/` to confirm that `updateLuaLibraryConfigurations` is referenced only in `workspaceManager.ts`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: language definitions for TSP-Link systems no longer end up out of date or duplicated when the system configuration changes several times in quick succession. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension", using an MP5103 system with three slots. (a) Add a new system: after the libraries settle, `commonTables.lua` declares each `slot` table once, and `Lua.workspace.library` lists the new system's libraries. (b) In edit mode, change all three slot modules quickly: after about two runs, the generated files match the final selection, with no leftover definitions from earlier selections. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-language-workspace/spec.md` exists. Compare its "When Lua libraries are regenerated" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-overlapping-lua-regeneration`.
