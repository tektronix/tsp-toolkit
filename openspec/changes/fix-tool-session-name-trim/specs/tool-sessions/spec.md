# Spec Delta

## MODIFIED Requirements

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
creation. An accepted name SHALL be trimmed of leading and trailing whitespace, and the
tool's panel SHALL open for a new session with the trimmed name. The session SHALL NOT be
saved until the backend reports it.

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

#### Scenario: Name with surrounding spaces

- **WHEN** the user names a new script generation session `" sweep "` and the backend
  then reports the new session
- **THEN** the session is saved and shown as `sweep`, and opening its script opens
  `sweep.tsp`
