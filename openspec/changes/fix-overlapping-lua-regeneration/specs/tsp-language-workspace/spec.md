# Spec Delta

## MODIFIED Requirements

### Requirement: When Lua libraries are regenerated

The extension SHALL regenerate the Lua libraries on activation when a folder is open, and
every time `tsp.tspLinkSystemConfigurations` changes, whatever caused the change. At most
one regeneration SHALL run at a time in a window. If the setting changes while a
regeneration is running, the extension SHALL NOT start another run alongside it. Instead,
after the current run finishes, it SHALL run exactly one more regeneration using the
setting's value at that point, however many changes arrived during the run. The follow-up
SHALL run even if the current regeneration failed.

#### Scenario: Activating another system

- **WHEN** the user activates a different system configuration
- **THEN** the Lua libraries are regenerated from the newly active system

#### Scenario: Editing the active system

- **WHEN** the user changes a slot module of the active system in the System
  Configurations view
- **THEN** the Lua libraries are regenerated

#### Scenario: Adding a system writes the setting twice

- **WHEN** the user adds a system `lab`, which writes the setting once to append it and
  again to activate it
- **THEN** the regenerations run one after the other, and the final
  `Lua.workspace.library` and `commonTables.lua` describe `lab` as the active system, with
  each table declared once

#### Scenario: Several edits during one regeneration

- **WHEN** a regeneration is running and the user changes three slot modules before it
  finishes
- **THEN** exactly one more regeneration runs after it, and its output reflects all three
  changes
