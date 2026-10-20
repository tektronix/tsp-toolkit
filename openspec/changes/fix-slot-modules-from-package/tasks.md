# Tasks

## 1. Derive slot modules from the package

- [ ] 1.1 Add a function that doesn't import `vscode`, for example `classifyLibraries(root: string): { models: string[]; modules: string[] }` in a small new file under `src/`. For each directory under `root` other than `tsp-lua-5.0` and `nodes_definitions`, it reads `AllTspCommands/definitions.lua`. A directory whose file contains `$slot_number$` goes in `modules`, and every other directory, including one whose file is missing or unreadable, goes in `models`. Both lists are sorted. Add `src/test/classifyLibraries.test.ts` (TDD UI) with a temporary fixture tree covering: a mainframe, a module, a mainframe without `Helper` (like MP5103), a directory missing `definitions.lua`, and the two excluded folders. Add one test that runs against the real `COMMAND_SETS` and checks that `MPSU50-2ST`, `MSMU60-2`, and `MSMU200-2` are modules and `MP5103` and `2450` are models. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/classifyLibraries.test.ts`.
- [ ] 1.2 In `src/resourceManager.ts`, build `SUPPORTED_MODELS_DETAILS` from `classifyLibraries(COMMAND_SETS)`: one entry per model, and `MP5103` gets `{ noOfSlots: 3, moduleOptions: [EMPTY, ...modules] }` from a slotted-mainframe table that holds only slot counts. Remove the `MPSU50_2ST`, `MSMU60_2`, and `MSMU200_2` constants. Verify with `npm run compile`, and search `src/` to confirm that none of the three module names appears in TypeScript or JavaScript source any more.
- [ ] 1.3 Confirm that `src/ConifgWebView.ts` (fetched-system validation) and `src/systemConfig.js` (slot rendering) need no change because they read only `SUPPORTED_MODELS_DETAILS`. Verify by reading their uses of `moduleOptions` and `noOfSlots`, and run `npm run compile` so the static `systemConfig.js` is copied.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: slot modules are now detected from the instrument library, so new modules are offered for MP5103 slots and are no longer listed as instrument models. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) In the System Configurations view, the model lists contain no slot modules, and an MP5103 local node shows three slots offering `Empty`, `MPSU50-2ST`, `MSMU200-2`, `MSMU60-2`. (b) Copy `node_modules/@tektronix/keithley_instrument_libraries/keithley_instrument_libraries/MSMU60-2` to a sibling folder `MSMU-TEST`, then reload the window: `MSMU-TEST` appears as a slot option, not as a model, and choosing it generates `MSMU-TEST_slot1.lua`. Delete `MSMU-TEST` afterwards. (c) A saved system created before the change still loads with its modules selected. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-link-system-configurations/spec.md` exists. Compare its "Supported models and modules" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-slot-modules-from-package`.
