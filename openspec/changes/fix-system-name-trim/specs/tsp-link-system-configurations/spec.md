# Spec Delta

## MODIFIED Requirements

### Requirement: Adding a system

The "Add new system" action in the view's title bar SHALL show an empty form. With no
folder open it SHALL show an information message saying that no workspace is open. If the
view has never been shown it SHALL do nothing. Saving the form SHALL be refused, with the
field marked invalid, when the name is empty or whitespace, when the trimmed name matches
an existing system, or when two remote nodes use the same node number. A valid system
SHALL be appended to the list with its name trimmed of leading and trailing whitespace and
everything else exactly as entered, and then activated.

#### Scenario: Add a valid system

- **WHEN** the user adds a system `lab` with a 2450 local node and saves
- **THEN** `lab` is appended to the list, becomes the only active system, and the message
  `The system configuration "lab" has been activated.` is shown

#### Scenario: Name with surrounding spaces

- **WHEN** the user adds a system named `" lab "` and saves
- **THEN** the entry is saved with `name` `lab`, and the activation message names `lab`

#### Scenario: Duplicate name

- **WHEN** the user tries to save a new system named `bench` while `bench` exists
- **THEN** nothing is saved and the name field is marked "Duplicate system name not
  allowed"

#### Scenario: Duplicate node number

- **WHEN** two remote nodes in the form both use node number 2
- **THEN** nothing is saved and both node-number fields are marked as duplicates

### Requirement: Naming a fetched system

Whenever the setting changes and holds an entry with no name, the extension SHALL check
that entry. If its local node model is missing or not supported, the extension SHALL show
`Cannot add new System. The local node model "<model>" is not supported.` and remove the
entry. If any remote node model is unsupported, or any slot module is not one of its
model's module options, the extension SHALL show an error listing every problem and remove
the entry. Otherwise it SHALL ask for a system name, rejecting names that are empty after
trimming or that match an existing system. Entering a name SHALL save the trimmed name on
the entry and activate that system. Cancelling SHALL remove the entry. Entries that
already have a name SHALL NOT be checked against the supported models or modules.

#### Scenario: Fetched system named

- **WHEN** a fetch adds an entry with no name for a supported 2450 with a 2460 on
  `node[2]`, and the user enters `rack`
- **THEN** the entry is saved as `rack` and becomes the only active system

#### Scenario: Fetched system named with surrounding spaces

- **WHEN** a fetch adds an entry with no name and the user enters `"rack  "`
- **THEN** the entry is saved as `rack`

#### Scenario: Unsupported model fetched

- **WHEN** a fetch adds an entry with no name whose local node model is not supported
- **THEN** an error names the unsupported model and the entry is removed

#### Scenario: Naming cancelled

- **WHEN** the user dismisses the name prompt for a fetched system
- **THEN** the entry is removed from the setting

### Requirement: Legacy system configuration migration

On activation, if a folder is open and the first folder contains
`.vscode/tspConfig/config.tsp.json`, the extension SHALL check that the file has a
non-empty `self` model and a `nodes` object, that every node with a `model` maps to a
distinct node number, and that every model is supported. If the file passes, the extension
SHALL ask whether to export it to the new structure and delete the old file and folder.
Answering "Yes" SHALL ask for a new system name. A named system SHALL be added with its
trimmed name, `self` as the local node, and one remote node per node in the file, without
slots, and activated. The view SHALL be focused and the `.vscode/tspConfig/` folder
deleted. If the name prompt is dismissed, the extension SHALL show "Unable to get the new
system name" and keep the old folder. Answering "No", dismissing the question, or a file
that fails the checks SHALL leave everything unchanged, so the question is asked again on
the next activation.

#### Scenario: Legacy file migrated

- **WHEN** the first folder holds a legacy file with `self` `2450` and a 2460 node 2, and
  the user answers "Yes" and enters `old`
- **THEN** a system `old` with local node 2450 and `node[2]` 2460 is added and activated,
  and `.vscode/tspConfig/` is deleted

#### Scenario: Migration declined

- **WHEN** the user answers "No" to the migration question
- **THEN** nothing changes and the question appears again on the next activation

#### Scenario: Unsupported model in legacy file

- **WHEN** the legacy file names a model that is not supported
- **THEN** no question is asked and the file is left in place
