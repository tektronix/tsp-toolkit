# Spec Delta

## MODIFIED Requirements

### Requirement: Fetching a system from an instrument

The "Fetch connected instrument and its TSP-Link nodes" action in the view's title bar
SHALL require an open folder. With no folder open it SHALL show an information message
saying that no workspace is open. When the active terminal is an instrument terminal of
the extension, the action SHALL use that terminal's connection. Otherwise it SHALL ask the
user to pick a connection. The action SHALL show the terminal and send it a `.nodes`
command naming a temporary file that belongs to the extension, so that the instrument
backend writes the connected system there as an entry without a name. The action SHALL NOT
direct the backend to write into any workspace or folder settings file.

When the temporary file holds an entry without a name, the extension SHALL append every
such entry to `tsp.tspLinkSystemConfigurations` at the workspace target, keeping the
entries already saved, and SHALL delete the temporary file. This SHALL behave the same in
single-folder and multi-root workspaces. If no entry arrives within 30 seconds, the
extension SHALL delete the temporary file, leave the setting unchanged, and show a warning
that no TSP-Link configuration was received from the instrument.

#### Scenario: Fetch from the active instrument terminal

- **WHEN** an instrument terminal is active and the user runs the fetch action
- **THEN** that terminal is shown and receives a `.nodes` command naming a temporary file
  that is not in the workspace

#### Scenario: Fetch with no folder open

- **WHEN** no folder is open and the user runs the fetch action
- **THEN** a message says no workspace is open and nothing is sent

#### Scenario: Fetch in a single-folder workspace

- **WHEN** a single folder is open, `bench` is saved, and a fetch completes
- **THEN** the folder's `.vscode/settings.json` holds `bench` and a new entry without a
  name, and the temporary file is gone

#### Scenario: Fetch in a multi-root workspace

- **WHEN** a multi-root workspace is open and a fetch completes
- **THEN** the new entry without a name is added to the setting in the `.code-workspace`
  file, no folder's `.vscode/settings.json` is changed, and the user is asked to name the
  system

#### Scenario: Nothing received

- **WHEN** the user runs the fetch action and the instrument backend writes nothing within
  30 seconds
- **THEN** a warning says no TSP-Link configuration was received, the setting is
  unchanged, and the temporary file is gone
