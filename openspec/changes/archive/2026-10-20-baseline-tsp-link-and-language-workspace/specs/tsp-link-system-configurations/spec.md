# Spec Delta

## Purpose

Describes how the extension stores named TSP-Link system configurations in the
`tsp.tspLinkSystemConfigurations` setting: the entry format, which models and slot modules
are offered, how systems are added, edited, activated, and deleted in the System
Configurations view, how a system is fetched from a connected instrument or migrated from
the legacy configuration file, and how the list is reset. This is a baseline of current
behavior, including known quirks.

## ADDED Requirements

### Requirement: System configuration storage

System configurations SHALL be stored in the `tsp.tspLinkSystemConfigurations` setting, an
array with window scope (default `[]`). The extension SHALL write the setting to the
workspace target. Each entry SHALL have a `name`, a `localNode` model, an `isActive` flag,
an optional `slots` list for the local node, and an optional `nodes` list. Each slot SHALL
have a `slotId` (for example `slot[1]`) and a `module`. Each node SHALL have a `nodeId`
(for example `node[2]`), a `mainframe` model, and an optional `slots` list. Every action in
the extension that activates a system SHALL leave exactly one entry with `isActive` set to
`true`.

#### Scenario: System with one remote node

- **WHEN** a system `bench` is saved with a 2450 as the local node and a 2460 as `node[2]`
- **THEN** the workspace `.vscode/settings.json` holds an entry with `name` `bench`,
  `localNode` `2450`, and `nodes` containing `{ nodeId: "node[2]", mainframe: "2460" }`

#### Scenario: Activating leaves one active entry

- **WHEN** the user activates `bench` while `lab` is active
- **THEN** `bench` has `isActive` `true` and every other entry has `isActive` `false`

### Requirement: Supported models and modules

The models offered for the local node and for remote nodes SHALL be the model directories
shipped in the instrument-library package, excluding the base Lua library, the generated
definitions folder, and the directories of the slot modules the extension supports. The
MP5103 SHALL offer 3 slots, each taking `Empty` or one of the slot modules the extension
supports for the MP5103. Other models SHALL offer no slots. Node numbers SHALL be
selectable from 1 to 63.

#### Scenario: Choosing an MP5103 local node

- **WHEN** the user picks MP5103 as the local node
- **THEN** three slot selectors appear, each offering `Empty` and every slot module
  supported for the MP5103

#### Scenario: Slot modules are not offered as models

- **WHEN** the user opens the local node or remote node model list
- **THEN** no supported slot module, such as `MSMU60-2`, appears in the list

#### Scenario: Choosing a model without slots

- **WHEN** the user picks a 2450 as a remote node
- **THEN** no slot selectors appear for that node

### Requirement: System Configurations view

The System Configurations view SHALL require an open folder. With no folder open it SHALL
show an "Open Folder" button. Clicking the button SHALL open a folder picker and open the
first chosen folder. With a folder open and no saved systems, the view SHALL explain that
systems can be added by hand or fetched from a connected instrument. Otherwise the view
SHALL show a selector listing every saved system by name, with the active system selected
and its details shown. The view SHALL refresh whenever the setting changes.

#### Scenario: No folder open

- **WHEN** the user opens the System Configurations view with no folder open
- **THEN** the view shows an "Open Folder" button instead of any systems

#### Scenario: Setting edited by hand

- **WHEN** the user edits `tsp.tspLinkSystemConfigurations` in `settings.json` while the
  view is open
- **THEN** the view shows the edited list with the active system selected

### Requirement: Adding a system

The "Add new system" action in the view's title bar SHALL show an empty form. With no
folder open it SHALL show an information message saying that no workspace is open. If the
view has never been shown it SHALL do nothing. Saving the form SHALL be refused, with the
field marked invalid, when the name is empty or whitespace, when the trimmed name matches
an existing system, or when two remote nodes use the same node number. A valid system
SHALL be appended to the list exactly as entered, without trimming the name, and then
activated.

#### Scenario: Add a valid system

- **WHEN** the user adds a system `lab` with a 2450 local node and saves
- **THEN** `lab` is appended to the list, becomes the only active system, and the message
  `The system configuration "lab" has been activated.` is shown

#### Scenario: Duplicate name

- **WHEN** the user tries to save a new system named `bench` while `bench` exists
- **THEN** nothing is saved and the name field is marked "Duplicate system name not
  allowed"

#### Scenario: Duplicate node number

- **WHEN** two remote nodes in the form both use node number 2
- **THEN** nothing is saved and both node-number fields are marked as duplicates

### Requirement: Editing a system

When a saved system is shown, its name SHALL be read-only. Each change to the local node,
a slot module, a remote node's model or number, or adding or removing a remote node SHALL
immediately write the changed local node, slots, and nodes to the **active** entry, as long
as the form passes the same checks as adding. There SHALL be no separate save step. A
change that fails the checks SHALL NOT be written.

#### Scenario: Change a slot module

- **WHEN** the active system is shown and the user changes slot 2 from `Empty` to
  `MSMU60-2`
- **THEN** the active entry in the setting is updated right away with slot 2 set to
  `MSMU60-2`

#### Scenario: Edit makes node numbers collide

- **WHEN** the user changes a remote node's number to one already used by another node
- **THEN** the setting is not changed and both fields are marked as duplicates

### Requirement: Activating a system

Choosing a system in the view's selector SHALL show that system's details and activate it.
Activating SHALL set `isActive` to `true` on every entry with that name and `false` on all
others, and SHALL show the message `The system configuration "<name>" has been
activated.`

#### Scenario: Switch systems

- **WHEN** the user picks `lab` in the selector while `bench` is active
- **THEN** `lab` becomes active, `bench` becomes inactive, and the activation message for
  `lab` is shown

### Requirement: Deleting a system

The delete icon next to the selector SHALL remove every entry whose name matches the
selected system, without confirmation. The view SHALL then select the first remaining
system, and the extension SHALL activate it, whether or not the deleted system was the
active one.

#### Scenario: Delete the active system

- **WHEN** `bench`, `lab`, and `rack` are saved, `lab` is active, and the user deletes
  `lab`
- **THEN** `lab` is removed and `bench` becomes active

#### Scenario: Delete an inactive system

- **WHEN** `bench`, `lab`, and `rack` are saved, `rack` is active, and the user deletes
  `lab`
- **THEN** `lab` is removed and `bench` becomes active in place of `rack`

### Requirement: Fetching a system from an instrument

The "Fetch connected instrument and its TSP-Link nodes" action in the view's title bar
SHALL require an open folder. With no folder open it SHALL show an information message
saying that no workspace is open. When the active terminal is an instrument terminal of
the extension, the action SHALL use that terminal's connection. Otherwise it SHALL ask the
user to pick a connection. The action SHALL show the terminal and send it
`.nodes "<first workspace folder>/.vscode/settings.json"`, which tells the instrument
backend to add the connected system to that file as an entry without a name.

#### Scenario: Fetch from the active instrument terminal

- **WHEN** an instrument terminal is active and the user runs the fetch action
- **THEN** that terminal is shown and receives the `.nodes` command with the first
  workspace folder's settings file

#### Scenario: Fetch with no folder open

- **WHEN** no folder is open and the user runs the fetch action
- **THEN** a message says no workspace is open and nothing is sent

### Requirement: Naming a fetched system

Whenever the setting changes and holds an entry with no name, the extension SHALL check
that entry. If its local node model is missing or not supported, the extension SHALL show
`Cannot add new System. The local node model "<model>" is not supported.` and remove the
entry. If any remote node model is unsupported, or any slot module is not one of its
model's module options, the extension SHALL show an error listing every problem and remove
the entry. Otherwise it SHALL ask for a system name, rejecting names that are empty after
trimming or that match an existing system. Entering a name SHALL save it on the entry and
activate that system. Cancelling SHALL remove the entry. Entries that already have a name
SHALL NOT be checked against the supported models or modules.

#### Scenario: Fetched system named

- **WHEN** a fetch adds an entry with no name for a supported 2450 with a 2460 on
  `node[2]`, and the user enters `rack`
- **THEN** the entry is saved as `rack` and becomes the only active system

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
Answering "Yes" SHALL ask for a new system name. A named system SHALL be added with `self`
as the local node and one remote node per node in the file, without slots, and activated.
The view SHALL be focused and the `.vscode/tspConfig/` folder deleted. If the name prompt
is dismissed, the extension SHALL show "Unable to get the new system name" and keep the
old folder. Answering "No", dismissing the question, or a file that fails the checks SHALL
leave everything unchanged, so the question is asked again on the next activation.

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

### Requirement: Resetting system configurations

Reset to Defaults SHALL offer a "Saved System Configurations" option. When the setting is
empty the option SHALL be skipped with the reason "No saved system configurations found."
Otherwise it SHALL remove the setting's user, workspace, and workspace-folder values.

#### Scenario: Reset with saved systems

- **WHEN** two systems are saved in the workspace and the user resets saved system
  configurations
- **THEN** the setting returns to `[]` in every scope where it was set

#### Scenario: Nothing to reset

- **WHEN** no systems are saved and the user opens Reset to Defaults
- **THEN** the Saved System Configurations option is skipped with "No saved system
  configurations found."

### Requirement: System configuration change notification

Whenever the setting changes, the open script-generation and trigger-flow sessions SHALL
reload the system list, send it to their backend process, and refresh the Tools view. The
Lua libraries SHALL be regenerated as described in `tsp-language-workspace`.

#### Scenario: System added while a script-generation session is open

- **WHEN** a script-generation session is open and the user adds a system
- **THEN** the session's backend receives the updated system list
