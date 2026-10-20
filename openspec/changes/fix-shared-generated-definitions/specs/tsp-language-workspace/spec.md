# Spec Delta

## MODIFIED Requirements

### Requirement: Generated-definitions folder

Generated definitions SHALL be written to a single folder in the extension's storage for
the current workspace, not inside the workspace and not inside the installed extension.
Each workspace SHALL have its own folder, so windows with different workspaces never
share one. The extension SHALL NOT write, modify, or delete any file in the installed
instrument-library package. It SHALL only read the definition templates and libraries it
ships. Every regeneration SHALL delete the folder's contents before writing new files,
keeping the folder itself. With no folder open, the extension SHALL NOT regenerate the
libraries.

#### Scenario: Node removed from the active system

- **WHEN** `node[3]` is removed from the active system
- **THEN** after regeneration the generated-definitions folder no longer contains a
  `node3` definition

#### Scenario: Two windows with different active systems

- **WHEN** window A's workspace has a 2450 with a 2460 on `node[2]` active, window B's
  workspace has an MP5103 with `MSMU60-2` in slot 1 active, and window B regenerates its
  libraries
- **THEN** window A's generated-definitions folder still holds `2460_node2.lua` and no
  `MSMU60-2_slot1.lua`

#### Scenario: Installed package left unchanged

- **WHEN** the libraries are regenerated for any active system
- **THEN** no file or folder in the installed instrument-library package is created,
  changed, or removed

### Requirement: Updating the library setting

Each regeneration SHALL first set `Lua.workspace.library` in workspace settings to `[]`.
It SHALL then wait 2 seconds and set it to the complete list of library folders as
absolute paths. The base library and the model libraries SHALL point into the installed
extension. The generated-definitions folder SHALL point into the extension's storage for
the workspace. This SHALL replace the list, discarding any entries the user added.

#### Scenario: User library entry discarded

- **WHEN** the user adds their own folder to `Lua.workspace.library` in workspace
  settings and then activates a system
- **THEN** after regeneration the list holds only the extension's library paths

#### Scenario: Paths in shared settings

- **WHEN** the libraries are regenerated in a folder whose `.vscode/settings.json` is
  under version control
- **THEN** the file contains absolute paths into this machine's installed extension and
  this machine's extension storage for the workspace
