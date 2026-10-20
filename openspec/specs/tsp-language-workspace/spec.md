# tsp-language-workspace Specification

## Purpose

Describes the language settings the extension writes so that the Lua language server
understands TSP files: file associations, Lua runtime settings, and the
`Lua.workspace.library` list it builds from the active TSP-Link system configuration,
including the per-node and per-slot definitions it generates. This is a baseline of
current behavior, including known quirks.

## Requirements

### Requirement: Lua language server dependency

The extension SHALL declare the `sumneko.lua` extension as a dependency and SHALL NOT
provide its own language server. Completion and diagnostics for TSP files SHALL come from
that extension, configured through the settings in this spec.

#### Scenario: Install

- **WHEN** the user installs the extension
- **THEN** VS Code also installs `sumneko.lua`

### Requirement: TSP file associations

On every activation the extension SHALL associate `*.tsp` and `*.tspa` with `lua` in the
user (global) `files.associations` setting. It SHALL merge the two entries into the
existing associations, keeping other entries.

#### Scenario: Existing associations kept

- **WHEN** user settings associate `*.foo` with `ini` and the extension activates
- **THEN** user `files.associations` holds `*.foo`, `*.tsp`, and `*.tspa`

#### Scenario: No folder open

- **WHEN** the extension activates with no folder open
- **THEN** the TSP file associations are still written to user settings

### Requirement: Lua runtime settings

On activation with a folder open, the extension SHALL write these values to workspace
settings, overwriting any value already there:

- `Lua.workspace.preloadFileSize`: `2000`
- `Lua.workspace.ignoreDir`: `[]`
- `Lua.diagnostics.libraryFiles`: `"Disable"`
- `Lua.runtime.version`: `"Lua 5.1"`

It SHALL also merge into `Lua.runtime.builtin` with `basic`, `builtin`, and `table` set to
`enable` and `bit`, `bit32`, `coroutine`, `debug`, `ffi`, `io`, `jit`, `jit.profile`,
`jit.util`, `math`, `os`, `package`, `string`, `string.buffer`, `table.clear`, `table.new`,
and `utf8` set to `disable`, keeping any other keys. With no folder open, none of these
settings SHALL be written.

#### Scenario: Folder opened

- **WHEN** the extension activates in a folder with no `.vscode/settings.json`
- **THEN** a workspace `settings.json` is created holding the Lua runtime settings above

#### Scenario: User ignore list replaced

- **WHEN** workspace settings set `Lua.workspace.ignoreDir` to `["build"]` and the
  extension activates
- **THEN** `Lua.workspace.ignoreDir` in workspace settings becomes `[]`

### Requirement: When Lua libraries are regenerated

The extension SHALL regenerate the Lua libraries on activation when a folder is open, and
every time `tsp.tspLinkSystemConfigurations` changes, whatever caused the change. Each
change SHALL start its own regeneration.

#### Scenario: Activating another system

- **WHEN** the user activates a different system configuration
- **THEN** the Lua libraries are regenerated from the newly active system

#### Scenario: Editing the active system

- **WHEN** the user changes a slot module of the active system in the System
  Configurations view
- **THEN** the Lua libraries are regenerated

### Requirement: Base Lua libraries

Every regeneration SHALL include the base TSP Lua 5.0 library from the instrument-library
package and the generated-definitions folder in `Lua.workspace.library`. When no system is
active, these two SHALL be the only entries. The generated-definitions folder SHALL then
hold only a `commonTables.lua` file marked as a Lua definition file (`---@meta`).

#### Scenario: No active system

- **WHEN** no saved system configuration is active and the libraries are regenerated
- **THEN** `Lua.workspace.library` lists only the base library and the
  generated-definitions folder

### Requirement: Libraries from the active system

Regeneration SHALL use only the active system configuration. For each model it uses, the
model's `Helper` library SHALL be added once. In addition:

- The local node model SHALL add its full command library (`AllTspCommands`).
- Each remote `node[N]` SHALL add a generated `<MODEL>_node<N>.lua` definition for that
  model's TSP-Link commands on node `N`. The node SHALL be listed in a `node` table in
  `commonTables.lua`.
- Each local-node slot `slot[S]` that is not `Empty` SHALL add a generated
  `<MODULE>_slot<S>.lua` definition for that module on slot `S`, and SHALL be declared and
  listed in a `slot` table in `commonTables.lua`.
- Each remote-node slot that is not `Empty` SHALL add a generated
  `<MODULE>_node<N>_slot<S>.lua` definition, and SHALL be declared and listed in a
  `node[N].slot` table in `commonTables.lua`.

A remote node whose model is also the local node model SHALL share the local node's
full command library.

#### Scenario: Local node with one remote node

- **WHEN** the active system has a 2450 local node and a 2460 on `node[2]`
- **THEN** the library list includes the 2450 `Helper` and `AllTspCommands`, the 2460
  `Helper`, and the generated-definitions folder, which holds `2460_node2.lua` and a
  `commonTables.lua` containing `node = {[2] = node[2]}`

#### Scenario: MP5103 with modules

- **WHEN** the active system has an MP5103 local node with `MSMU60-2` in slot 1 and
  `Empty` in slots 2 and 3
- **THEN** the generated-definitions folder holds `MSMU60-2_slot1.lua`, the library list
  includes the `MSMU60-2` `Helper`, and `commonTables.lua` lists only `slot[1]` in its
  `slot` table

### Requirement: Generated-definitions folder

Generated definitions SHALL be written to a single folder inside the installed
instrument-library package, not inside the workspace. Every regeneration SHALL delete the
folder's contents before writing new files, keeping the folder itself.

#### Scenario: Node removed from the active system

- **WHEN** `node[3]` is removed from the active system
- **THEN** after regeneration the generated-definitions folder no longer contains a
  `node3` definition

### Requirement: Updating the library setting

Each regeneration SHALL first set `Lua.workspace.library` in workspace settings to `[]`.
It SHALL then wait 2 seconds and set it to the complete list of library folders as
absolute paths into the installed extension. This SHALL replace the list, discarding any
entries the user added.

#### Scenario: User library entry discarded

- **WHEN** the user adds their own folder to `Lua.workspace.library` in workspace
  settings and then activates a system
- **THEN** after regeneration the list holds only the extension's library paths

#### Scenario: Paths in shared settings

- **WHEN** the libraries are regenerated in a folder whose `.vscode/settings.json` is
  under version control
- **THEN** the file contains absolute paths into this machine's installed extension

### Requirement: Regeneration failures

If writing any of these settings fails, the extension SHALL show the error message
`Failed to update <setting> configuration`. Any other failure during regeneration, such
as a missing definition template, SHALL be logged and SHALL NOT be shown to the user. In
that case `Lua.workspace.library` SHALL stay `[]` until the next successful regeneration.

#### Scenario: Definition template missing

- **WHEN** the active system uses a model whose TSP-Link definition template is missing
- **THEN** an error is logged, no message is shown, and `Lua.workspace.library` stays `[]`
