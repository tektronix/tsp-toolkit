# Tasks

## 1. Confirm the backend's file handling

- [ ] 1.1 With a connected instrument, run `.nodes "<tmp>/a.json"` by hand in an instrument terminal, first with the file missing and then with it containing `{}`. Record whether kic-cli creates the file, whether it needs it to exist, and what it writes (top-level key, entry shape, whether it keeps other content). Record the findings at the top of `design.md`'s "Hand kic-cli a temporary file" decision, and note which starting state the implementation uses.

## 2. Collect the fetched entry

- [ ] 2.1 Add a function that doesn't import `vscode`, for example `extractUnnamedSystems(text: string): SystemInfo[] | undefined` in a small new file under `src/`. It returns the entries with an empty `name` under `tsp.tspLinkSystemConfigurations`, or `undefined` when the text isn't valid JSON or has no such entry. Add `src/test/fetchedSystems.test.ts` (TDD UI) covering: a valid file with one unnamed entry; a file with named and unnamed entries (only the unnamed ones are returned); a truncated JSON file; an empty object; a missing key. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/fetchedSystems.test.ts`. If `SystemInfo` can't be imported without pulling in `vscode`, define a local structural type.
- [ ] 2.2 Change `Connection.getNodes()` in `src/connection.ts` to take the full target file path and send `.nodes "<path>"` unchanged otherwise. Verify with `npm run compile`.
- [ ] 2.3 In the `systemConfigurations.fetchConnectionNodes` command in `src/extension.ts`, create a unique temporary file under `COMMON_PATHS.temp` (in the starting state chosen in 1.1), pass its path to `getNodes()`, and poll it every 500 ms for up to 30 seconds using `extractUnnamedSystems()`. On success, re-read the current `tsp.tspLinkSystemConfigurations`, append the unnamed entries, write the result with `update(..., false)`, and delete the file. On timeout, delete the file and show `vscode.window.showWarningMessage("No TSP-Link configuration was received from the instrument.")`. Keep the "no workspace open" check and the connection selection unchanged. Log through `Log` with a `SourceLocation`. Verify with `npm run compile`, and search `src/` to confirm that nothing passes `.vscode/settings.json` to `getNodes()` any more.

## 3. Changelog

- [ ] 3.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: fetching a TSP-Link system from a connected instrument now works in multi-root workspaces. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 4. Integration checks

- [ ] 4.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 4.2 Manual check with "Run Extension" and a TSP-Link system. (a) Single folder with `bench` saved: fetch, name the system `rack`; `.vscode/settings.json` holds `bench` and `rack`, `rack` is active, and the temporary file is gone. (b) Multi-root workspace saved as a `.code-workspace` file: fetch and name the system; the entry is in the `.code-workspace` file, no folder's `settings.json` changed, and the view shows the new system. (c) Fetch with a connection whose instrument has been unplugged: after about 30 seconds the warning appears and the setting is unchanged. Record the results.
- [ ] 4.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-link-system-configurations/spec.md` exists. Compare its "Fetching a system from an instrument" requirement with this change's delta and re-apply this change's edit if the baseline text has changed. Verify with `openspec validate fix-fetch-nodes-multi-root`.
