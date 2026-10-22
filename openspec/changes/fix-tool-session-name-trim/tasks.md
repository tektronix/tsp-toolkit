# Tasks

## 1. Trim names before use

- [ ] 1.1 In `createNewSession()` in `src/scriptGenWebViewManager.ts` and `src/triggerFlowWebViewManager.ts`, set `this.sessionName = input.trim()` once the validator accepts the input. `validateName()` already rejects names that are empty after trimming, so the result is never empty. Verify with `npm run compile`, and by reading both methods to confirm that the untrimmed `input` is no longer used after validation and that `setActiveStatus()` receives the trimmed name.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: leading and trailing spaces are removed from new script generation and TriggerFlow session names, so they no longer end up in the session name or the generated script's file name. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension", with a TSP-Link system saved. (a) Create a script generation session named `" sweep "` and make a change in the panel: `tsp.scriptGenSessions` holds `sweep`, the Tools view shows `sweep`, and Open Script opens `sweep.tsp`. (b) Try to create another session named `"sweep  "`: it is rejected as a duplicate. (c) Repeat (a) for TriggerFlow with `" burst"`. (d) A session saved by an earlier version with surrounding spaces still opens. Record the results, or note what could not be exercised.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-sessions/spec.md` exists. Compare its "Creating a session" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-tool-session-name-trim`.
