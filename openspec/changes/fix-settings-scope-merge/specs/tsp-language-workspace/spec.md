# Spec Delta

## MODIFIED Requirements

### Requirement: TSP file associations

On every activation the extension SHALL associate `*.tsp` and `*.tspa` with `lua` in the
user (global) `files.associations` setting. It SHALL merge the two entries into the
associations already stored in user settings, keeping those entries. It SHALL NOT copy
associations defined only in workspace or folder settings into user settings.

#### Scenario: Existing associations kept

- **WHEN** user settings associate `*.foo` with `ini` and the extension activates
- **THEN** user `files.associations` holds `*.foo`, `*.tsp`, and `*.tspa`

#### Scenario: Workspace associations not copied

- **WHEN** only the workspace settings associate `*.bar` with `ini` and the extension
  activates
- **THEN** user `files.associations` holds `*.tsp` and `*.tspa` but not `*.bar`, and the
  workspace's `*.bar` entry is unchanged

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
and `utf8` set to `disable`, keeping any other keys already stored in workspace settings.
It SHALL NOT copy keys defined only in user or folder settings into workspace settings.
With no folder open, none of these settings SHALL be written.

#### Scenario: Folder opened

- **WHEN** the extension activates in a folder with no `.vscode/settings.json`
- **THEN** a workspace `settings.json` is created holding the Lua runtime settings above

#### Scenario: User ignore list replaced

- **WHEN** workspace settings set `Lua.workspace.ignoreDir` to `["build"]` and the
  extension activates
- **THEN** `Lua.workspace.ignoreDir` in workspace settings becomes `[]`

#### Scenario: User-level builtin key not copied

- **WHEN** user settings set `Lua.runtime.builtin` to `{ "lpeg": "enable" }` and the
  extension activates in a folder
- **THEN** workspace `Lua.runtime.builtin` holds the keys listed above but not `lpeg`
