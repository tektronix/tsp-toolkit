# Tasks

## 1. Trim names before saving

- [ ] 1.1 In `src/ConifgWebView.ts`, make `getNewSystemName()` return `name?.trim()`. The input box already rejects names that are empty after trimming, so the result is never empty, and both callers (fetched-system naming and legacy migration) save and activate the trimmed name. Verify with `npm run compile`, and by reading both callers to confirm that they use the returned value for both the saved `name` and `activateSystem()`.
- [ ] 1.2 In the `add` case of the message handler in `src/ConifgWebView.ts`, set `name: newSystemDetails.name.trim()` on the new item and pass the same trimmed name to the `systems` message's `selectedSystem` and to `activateSystem()`. Verify with `npm run compile` and by reading the diff: the untrimmed `newSystemDetails.name` is no longer used after the item is built.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: leading and trailing spaces are removed from new system configuration names, so a name can no longer be saved twice with different spacing. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Add `" lab "`: `settings.json` holds `lab` and the message names `lab`. (b) Try to add `"lab "` next: it is rejected as a duplicate. (c) Fetch a system and name it `"rack  "`: it is saved as `rack`. (d) With a legacy `.vscode/tspConfig/config.tsp.json`, migrate and name it `" old"`: it is saved as `old`. Record the results, or note what could not be exercised.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-link-system-configurations/spec.md` exists. Compare its "Adding a system", "Naming a fetched system", and "Legacy system configuration migration" requirements with this change's delta and re-apply this change's edits if the baseline text has changed. Verify with `openspec validate fix-system-name-trim`.
