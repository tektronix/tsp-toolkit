# Tasks

## 1. Handle an empty list after delete

- [ ] 1.1 In the `delete` case of `onDidReceiveMessage` in `src/ConifgWebView.ts`, call `this.activateSystem(systemInfo[0].name)` only when `systemInfo.length > 0`. Leave the `systems` message to the view unchanged (it already sends `selectedSystem: ""` for an empty list). Verify with `npm run compile` and by reading the diff: the case no longer reads `systemInfo[0]` without a length check.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: deleting the last saved system configuration no longer fails. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Save one system, then delete it: the view shows its empty state, `tsp.tspLinkSystemConfigurations` is `[]`, no activation message appears, and the "Extension Host" output shows no error from the delete handler. (b) Save `bench` and `lab`, delete `lab`: `bench` is activated with its message. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-link-system-configurations/spec.md` exists. Compare its "Deleting a system" requirement with this change's delta and re-apply this change's edit if the baseline text changed. Verify with `openspec validate fix-delete-last-system-config`.
