# Spec Delta

## MODIFIED Requirements

### Requirement: Opening the generated script

When the panel asks to open the script, the extension SHALL open
`<first workspace folder>/<session name>.tsp` in the editor column beside the panel,
unless that file is already shown in a visible editor. With no folder open it SHALL show
the error "No workspace folder found". With no current session name it SHALL show the
error "No session name found". If the script file does not exist, the extension SHALL
show the error "Script not found: `<path>`" and open nothing. If opening the file fails
for any other reason, the extension SHALL show the error "Failed to open script:
`<path>`. Error: `<message>`".

#### Scenario: Open script

- **WHEN** the panel for `sweep` asks to open the script and `sweep.tsp` is not visible
- **THEN** `sweep.tsp` from the first workspace folder opens beside the panel

#### Scenario: Script already visible

- **WHEN** `sweep.tsp` is already shown in a visible editor
- **THEN** nothing new is opened

#### Scenario: Script missing

- **WHEN** the panel for `sweep` asks to open the script and the first workspace folder
  has no `sweep.tsp`
- **THEN** the error "Script not found: `<folder>/sweep.tsp`" is shown and no editor
  opens

#### Scenario: Script cannot be opened

- **WHEN** `sweep.tsp` exists but VS Code fails to open it
- **THEN** the error "Failed to open script: `<folder>/sweep.tsp`. Error: `<message>`" is
  shown
