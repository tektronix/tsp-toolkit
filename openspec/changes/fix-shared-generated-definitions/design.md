# Design

## Context

`updateLuaLibraryConfigurations()` builds its output folder as
`join(COMMAND_SETS, "nodes_definitions")`. `COMMAND_SETS` is
`<extension>/node_modules/@tektronix/keithley_instrument_libraries/keithley_instrument_libraries`.
It reads the templates (`tspLinkSupportedCommands/definitions.txt`,
`AllTspCommands/definitions.lua`) from the model folders next to it and writes the
substituted copies and `commonTables.lua` into `nodes_definitions`. `workspaceManager.ts`
has no access to the `ExtensionContext` today.

## Goals / Non-Goals

**Goals:**

- No writes into the extension's install directory.
- One generated folder per workspace, so windows don't share it.

**Non-Goals:**

- Changing what is generated or which libraries are listed.
- Making `Lua.workspace.library` portable across machines. The paths stay absolute, as
  the baseline records.
- Deleting `nodes_definitions` folders written by earlier versions. A release installs
  into a new extension directory, so the old folder goes away with the old version. Only
  a development checkout keeps one, and the existing model filter already hides it.

## Decisions

### Use `context.storageUri`

The generated folder becomes `join(context.storageUri.fsPath, "nodes_definitions")`.
VS Code gives each workspace its own `storageUri` (for a single folder, a multi-root
`.code-workspace`, or an untitled multi-root workspace). It is outside the user's project
and isn't synced. VS Code doesn't open the same workspace in two windows, so per-workspace
storage is effectively per window.

Alternatives considered:

- **`<first folder>/.vscode/…`**: easy to inspect, but it puts generated files in the
  user's project, where they may get committed. In a multi-root workspace, the first
  folder would also be shared with any other workspace that contains it.
- **`globalStorageUri` with a per-workspace subfolder**: it isolates windows just as
  well, but the extension would have to choose the key and clean up stale folders itself.

### Provide the path at activation

Add an initializer in `workspaceManager.ts`, for example
`setGeneratedDefinitionsRoot(uri: vscode.Uri | undefined)`, called from `activate()`
before `configure_initial_workspace_configurations()` and before the `ConfigWebView` is
constructed. When it is `undefined` (no folder open), regeneration returns early without
touching the setting or the file system. This matches the existing rule that the Lua
settings are written only with a folder open, and keeps a stray setting change in an
empty window from failing.

`fs.mkdirSync(..., { recursive: true })` already creates the folder when needed, which
covers the storage directory not existing yet on first use.

## Risks / Trade-offs

- [Workspace storage lives under the VS Code user data directory, which is harder to find
  when debugging generated files] → The path is in `Lua.workspace.library`, and the
  extension can log it at debug level when it regenerates.
- [The Windows "pending delete" workaround (clearing the folder's contents rather than
  removing the folder) still matters in the new location] → Keep the existing
  clear-contents loop unchanged.
- [Users who added the old `nodes_definitions` path to their own settings] → Each
  regeneration already replaces `Lua.workspace.library`, so no user entry survives today.
  There is nothing to migrate.

## Migration Plan

None needed. The first activation after the update regenerates the libraries and rewrites
`Lua.workspace.library` with the new path. Rolling back to an older version regenerates
into the package folder again.
