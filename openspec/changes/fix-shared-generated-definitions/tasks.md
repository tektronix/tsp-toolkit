# Tasks

## 1. Move the generated folder to workspace storage

- [ ] 1.1 In `src/workspaceManager.ts`, add an exported `setGeneratedDefinitionsRoot(uri: vscode.Uri | undefined)` that stores the root in module state. In `updateLuaLibraryConfigurations()`, replace `join(COMMAND_SETS, "nodes_definitions")` with `join(<root>.fsPath, "nodes_definitions")`, and return early, before touching `Lua.workspace.library` or the file system, when the root is `undefined`. Keep the clear-contents loop and all reads from `COMMAND_SETS` unchanged. Verify with `npm run compile`, and search `src/` to confirm that nothing joins `COMMAND_SETS` with a path that is then written to.
- [ ] 1.2 In `activate()` in `src/extension.ts`, call `setGeneratedDefinitionsRoot(context.storageUri)` before `new ConfigWebView(...)` and before `configure_initial_workspace_configurations()`. Verify with `npm run compile` and by reading the diff: the call comes before both.
- [ ] 1.3 Confirm that `SUPPORTED_MODELS_DETAILS` in `src/resourceManager.ts` still excludes `nodes_definitions`, and leave it so a folder left over in a development checkout isn't offered as a model. Verify by reading the filter.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: generated TSP-Link language definitions are now kept per workspace, so VS Code windows with different active systems no longer overwrite each other's completions. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". Before starting, delete `node_modules/@tektronix/keithley_instrument_libraries/keithley_instrument_libraries/nodes_definitions` from the checkout. (a) Open a folder and activate a 2450 system with a 2460 on `node[2]`: `Lua.workspace.library` lists a `nodes_definitions` path under the extension's workspace storage that holds `2460_node2.lua`, and the package folder was not recreated. (b) Open a second folder in another Extension Development Host window with an MP5103 system: each window's generated folder holds only its own definitions, and completion for `node[2].` still works in the first window. (c) Open an empty window: no errors are logged when the setting changes. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-tsp-link-and-language-workspace` has been archived, so `openspec/specs/tsp-language-workspace/spec.md` exists. Compare its "Generated-definitions folder" and "Updating the library setting" requirements with this change's delta and re-apply this change's edits if the baseline text has changed. Verify with `openspec validate fix-shared-generated-definitions`.
