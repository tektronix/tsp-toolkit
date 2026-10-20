# Proposal

## Why

TSP-Link system configurations (`tsp.tspLinkSystemConfigurations`) and the Lua language
settings generated from them are what give users completion and diagnostics for multi-node
systems. Today their rules exist only in `ConifgWebView.ts`, `systemConfig.js`, and
`workspaceManager.ts`. Many paths write the setting: the System Configurations view, the
`.nodes` fetch, the legacy-config migration, and Reset to Defaults. Every write regenerates
the Lua libraries. This change records the **current** behavior as a baseline so later fixes
can be written as deltas against it.

## What Changes

- Add a baseline spec for TSP-Link system configurations as they behave today, quirks
  included. For example, deleting any system makes the first remaining system active, even
  when the deleted system was not the active one.
- Add a baseline spec for the Lua language workspace settings the extension writes and the
  libraries it generates from the active system, quirks included. For example, every
  regeneration first empties `Lua.workspace.library` and only fills it 2 seconds later.
- No code or behavior changes.

### Out of scope

- Hover and help documentation (`helpDocumentWebView.ts`, `@tektronix/web-help-documents`).
  This is a separate feature and is left for a later baseline.
- How script generation and trigger flow use the system list. This spec records only that
  they are notified when it changes.
- The TSP-to-Python conversion and its diagnostics (`tspConverter.ts`).
- Connection selection for the fetch command (`pickConnection()`), which is already part
  of `instrument-terminal-operations` and `instrument-connection-lifecycle`.

### Known deviations (not specified)

These are recorded here and deliberately left out of the specs, so the baseline does not
lock them in:

- **Deleting the last system fails.** After the list becomes empty, the handler reads the
  name of the first remaining system and throws. The setting is already empty by then, so
  the only visible effect is that no "activated" message appears.
- **Regenerations overlap.** Each write to the setting starts a full regeneration with no
  serialization. A single user action often writes more than once: adding a system writes
  the list and then writes it again to activate it, and in edit mode every dropdown change
  writes. The overlapping runs clear the same folder, append to the same
  `commonTables.lua`, and each waits 2 seconds before setting `Lua.workspace.library`, so
  the final library list and table file depend on timing. (Read from the code, not
  reproduced.)
- **Windows overwrite each other's definitions.** Generated definitions go to one folder
  inside the installed extension's instrument-library package. Every VS Code window shares
  that folder, so two windows with different active systems overwrite each other's files.
- **Fetch has no effect in multi-root workspaces.** `.nodes` writes into the first folder's
  `.vscode/settings.json`, but the setting is window-scoped and VS Code ignores folder-level
  values for window-scoped settings in a multi-root workspace. The view's own edits go to
  the `.code-workspace` file instead. (Inferred from VS Code's scoping rules, not
  reproduced.)
- **Names are not trimmed when saved.** The view rejects empty or duplicate names after
  trimming, but saves the name untrimmed, so `"bench "` can be saved next to `"bench"`.
- **Slot modules are a fixed list in the code.** Models are read from the directories the
  instrument-library package ships, but the slot modules (`MPSU50-2ST`, `MSMU60-2`,
  `MSMU200-2`) are hard-coded in `resourceManager.ts`. They are used both to keep module
  directories out of the model list and as the MP5103 slot options. A package release
  that adds a module directory therefore makes the new module appear as a mainframe
  model, not as a slot option. A fetched system that uses it in a slot is rejected as
  unsupported.
- **Merged settings are copied between scopes.** Object-valued settings the extension
  writes (`files.associations`, `Lua.runtime.builtin`) are merged with the *effective*
  value from all scopes before being written to one target. For example, `*.foo`
  associations defined in a workspace are copied into user settings on activation.

## Capabilities

### New Capabilities

- `tsp-link-system-configurations`: the `tsp.tspLinkSystemConfigurations` entry format and
  where it is stored, the supported models and slot modules, the System Configurations view
  (open-folder requirement, adding, editing, activating, deleting), fetching a system from a
  connected instrument and naming and validating the fetched entry, migrating the legacy
  `.vscode/tspConfig/config.tsp.json`, the Saved System Configurations option of Reset to
  Defaults, and change notification to the script-generation and trigger-flow tools.
- `tsp-language-workspace`: the file associations and Lua language-server settings the
  extension writes, when the Lua libraries are regenerated, which libraries and generated
  definitions are produced from the active system, the order in which
  `Lua.workspace.library` is updated, and how failures are reported.

### Modified Capabilities

None.

## Impact

- Documentation only: on archive, adds `openspec/specs/tsp-link-system-configurations/spec.md`
  and `openspec/specs/tsp-language-workspace/spec.md`.
- Describes behavior in `src/ConifgWebView.ts`, `src/systemConfig.js`,
  `src/workspaceManager.ts`, `src/resourceManager.ts` (`SUPPORTED_MODELS_DETAILS`),
  `src/connection.ts` (`getNodes`), `src/extension.ts` (activation, the
  `systemConfigurations.fetchConnectionNodes` and `systemConfigurations.addSystem`
  commands, Reset to Defaults), and the `listenToConfigChanges` handlers in
  `src/scriptGenWebViewManager.ts` and `src/triggerFlowWebViewManager.ts`, plus
  `contributes.configuration`, `contributes.views`, and `extensionDependencies` in
  `package.json`.
- What `.nodes` writes into `settings.json` is decided by the kic-cli backend. The spec
  describes only what the extension does with the resulting entry.
- Not described because it has no effect: the slot branch in `workspaceManager.ts` that
  adds `AllTspCommands` when a slot id contains `localNode` (slot ids never do), the unused
  `workspace_path` parameter of `updateConfiguration`, and the error log source labeled
  `extension.ts` in `workspaceManager.ts`.
