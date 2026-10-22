# Spec Delta

## Purpose

Describes how the extension stores and lists sessions of its two graphical tools,
I-V Characterization script generation and TriggerFlow®: the settings that hold them, how
the Tools view shows them, how a new session is named, how sessions reported by a tool's
backend are saved, how sessions are deleted and reset, and how the legacy
`tsp.script_generation` setting is migrated. This is a baseline of current behavior,
including known quirks.

## ADDED Requirements

### Requirement: Session storage

Script generation sessions SHALL be stored in the `tsp.scriptGenSessions` setting under
the key `I-V Characterization`. TriggerFlow sessions SHALL be stored in the
`tsp.triggerFlowSessions` setting under the key `Trigger Flow`. Both settings SHALL be
window-scoped objects. Each key SHALL hold an array of entries, each with a `name` and a
`config` string that the extension stores without interpreting it. Every change the
extension makes SHALL read the setting's current value, change it, and write the whole
object to workspace settings.

#### Scenario: One saved session of each tool

- **WHEN** the user has one script generation session `sweep` and one TriggerFlow session
  `burst`
- **THEN** the workspace `.vscode/settings.json` holds `tsp.scriptGenSessions` with
  `I-V Characterization` containing an entry named `sweep`, and
  `tsp.triggerFlowSessions` with `Trigger Flow` containing an entry named `burst`

### Requirement: Tools view

The Tools view SHALL require an open folder. With no folder open it SHALL show the item
"You have not yet opened a folder." and an "Open Folder" item that runs VS Code's open
folder command. With a folder open it SHALL show two top-level nodes, "I-V
Characterization Script Generation" and "TriggerFlow", in that order. Each node SHALL list
that tool's saved sessions by name in stored order, and SHALL be expanded when it has
sessions and not expandable when it has none. The session currently open in a tool's panel
SHALL be described as "● Active". At most one session per tool SHALL be active. Clicking a
session SHALL open it as described in `tool-backends`. The view SHALL refresh after the
extension adds, updates, or deletes a session, after a session becomes active or
inactive, and after `tsp.tspLinkSystemConfigurations` changes. For script generation it
SHALL also refresh after `tsp.lineFrequency` changes.

#### Scenario: No folder open

- **WHEN** the user opens the Tools view with no folder open
- **THEN** the view shows "You have not yet opened a folder." and an "Open Folder" item,
  and neither tool node

#### Scenario: Session open in a panel

- **WHEN** the TriggerFlow session `burst` is open in the TriggerFlow panel
- **THEN** `burst` is described as "● Active" under the TriggerFlow node and no other
  TriggerFlow session is

#### Scenario: Tool with no sessions

- **WHEN** no script generation sessions are saved
- **THEN** the "I-V Characterization Script Generation" node is shown with no expand
  arrow

### Requirement: Creating a session

Each tool node SHALL show an inline "+" action ("New Script Generation Session" or "New
TriggerFlow Session"). The action SHALL NOT appear in the Command Palette. If
`tsp.tspLinkSystemConfigurations` is empty, the action SHALL show the error "System
configurations not found. Please configure a system first." and do nothing else.
Otherwise it SHALL ask for a name, with the prompt "Enter name for the script" for script
generation or "Enter name for the TriggerFlow session" for TriggerFlow. After trimming,
the name SHALL be rejected with an information message when it is empty ("Session name
cannot be empty."), longer than 20 characters ("Session name must be 20 characters or
less."), contains anything other than letters, digits, underscores, dashes, and spaces
("Session name can only contain letters, numbers, spaces, dashes, and underscores."), or
matches a session of the same tool ("A session with this name already exists."). After a
rejection the prompt SHALL be shown again, empty. Dismissing the prompt SHALL cancel
creation. An accepted name SHALL be kept exactly as typed, without trimming, and the
tool's panel SHALL open for a new session with that name. The session SHALL NOT be saved
until the backend reports it.

#### Scenario: No system configured

- **WHEN** no TSP-Link systems are saved and the user clicks "+" on the script generation
  node
- **THEN** the error "System configurations not found. Please configure a system first."
  is shown and no prompt appears

#### Scenario: Name too long

- **WHEN** the user enters a 21-character name
- **THEN** "Session name must be 20 characters or less." is shown and the prompt appears
  again

#### Scenario: Same name in the other tool

- **WHEN** a script generation session `sweep` exists and the user names a new TriggerFlow
  session `sweep`
- **THEN** the name is accepted

#### Scenario: Valid name

- **WHEN** a system is saved and the user names a new TriggerFlow session `burst`
- **THEN** the TriggerFlow panel opens for `burst`, `burst` is marked active, and nothing
  is added to `tsp.triggerFlowSessions` yet

### Requirement: Saving sessions reported by the backend

When the backend reports a new session, the extension SHALL store the reported
configuration under the name of the session open in the panel. If a session with that
name already exists it SHALL replace that session's configuration. Otherwise it SHALL
append an entry and reveal and focus the new item in the Tools view. When the backend
reports an update, the extension SHALL replace the configuration of the session with that
name. If no such session exists, script generation SHALL ignore the update and TriggerFlow
SHALL append a new entry as for a new session. If no session name is set, the report
SHALL be ignored. The stored configuration SHALL be the reported payload from the first
occurrence of `{"request_type"` onward, or the whole payload if that text does not occur.

#### Scenario: New session reported

- **WHEN** the panel is open for the new script generation session `sweep` and the backend
  reports a new session
- **THEN** an entry named `sweep` is appended to `tsp.scriptGenSessions` and selected in
  the Tools view

#### Scenario: Update for a missing TriggerFlow session

- **WHEN** the TriggerFlow panel is open for `burst`, no `burst` entry is saved, and the
  backend reports an update
- **THEN** an entry named `burst` is appended to `tsp.triggerFlowSessions`

#### Scenario: Update for a missing script generation session

- **WHEN** the script generation panel is open for `sweep`, no `sweep` entry is saved, and
  the backend reports an update
- **THEN** `tsp.scriptGenSessions` is not changed

### Requirement: Deleting a session

Each session that is not active SHALL show an inline trash action ("Delete Script
Generation Session" or "Delete TriggerFlow Session"). The active session SHALL NOT show
it, and the action SHALL NOT appear in the Command Palette. The action SHALL remove every
entry of that tool with that name, without confirmation, and SHALL NOT delete the
generated script file.

#### Scenario: Delete an inactive session

- **WHEN** script generation sessions `sweep` and `pulse` are saved, `pulse` is open, and
  the user deletes `sweep`
- **THEN** `sweep` is removed from `tsp.scriptGenSessions`, `pulse` stays open, and
  `sweep.tsp` is left in the workspace folder

#### Scenario: Active session cannot be deleted from the view

- **WHEN** `pulse` is the active script generation session
- **THEN** its item shows no delete action

### Requirement: Deleting all sessions of a tool

The commands "TSP: Delete all Script Generation sessions" and "TSP: Delete all TriggerFlow
sessions" SHALL be available in the Command Palette and SHALL run without confirmation.
Each SHALL close that tool's panel if it is open, ignore any message from the panel while
it runs, set that tool's session list to empty, and refresh the Tools view. Sessions of
the other tool SHALL NOT change.

#### Scenario: Delete all while a session is open

- **WHEN** the TriggerFlow panel is open and the user runs "TSP: Delete all TriggerFlow
  sessions"
- **THEN** the panel closes, `Trigger Flow` in `tsp.triggerFlowSessions` becomes an empty
  array, and the script generation sessions are unchanged

### Requirement: Resetting sessions

Reset to Defaults SHALL offer "Delete Script Generation Sessions" and "Delete TriggerFlow
Sessions" options. When a tool has no saved sessions, its option SHALL be skipped with
the reason "No Script Generation sessions found." or "No TriggerFlow sessions found."
Otherwise the option SHALL carry the note "Note: Active and saved sessions will be
deleted." and SHALL run the matching delete-all command. The "Other TSP Toolkit
Preferences" option SHALL NOT reset `tsp.scriptGenSessions`, `tsp.triggerFlowSessions`, or
`tsp.script_generation`.

#### Scenario: Reset with saved TriggerFlow sessions

- **WHEN** two TriggerFlow sessions are saved and the user resets TriggerFlow sessions
- **THEN** both sessions are deleted as by "TSP: Delete all TriggerFlow sessions"

#### Scenario: Nothing to reset

- **WHEN** no script generation sessions are saved and the user opens Reset to Defaults
- **THEN** the script generation option is skipped with "No Script Generation sessions
  found."

### Requirement: Legacy session migration

On activation, before the Tools view is created, the extension SHALL migrate the legacy
`tsp.script_generation` setting if it holds any key. Its `I-V Characterization` sessions
SHALL be written to `tsp.scriptGenSessions` if that setting holds no script generation
sessions. Its `Trigger Flow` sessions SHALL be written to `tsp.triggerFlowSessions` if
that setting holds no TriggerFlow sessions. Each write SHALL replace the target setting in
workspace settings. When each tool's legacy sessions have been migrated, or the legacy
setting held none for that tool, the legacy setting SHALL be removed from workspace
settings. A failure SHALL be logged and SHALL NOT stop activation.

#### Scenario: Legacy sessions migrated

- **WHEN** `tsp.script_generation` holds one `I-V Characterization` and one `Trigger Flow`
  session and neither new setting holds sessions
- **THEN** each session is moved to its new setting and `tsp.script_generation` is
  removed

#### Scenario: Only one tool has legacy sessions

- **WHEN** `tsp.script_generation` holds only `I-V Characterization` sessions and
  `tsp.scriptGenSessions` holds none
- **THEN** the sessions are moved to `tsp.scriptGenSessions`, `tsp.triggerFlowSessions` is
  not written, and `tsp.script_generation` is removed
