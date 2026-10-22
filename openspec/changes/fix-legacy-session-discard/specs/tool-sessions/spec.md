# Spec Delta

## MODIFIED Requirements

### Requirement: Legacy session migration

On activation, before the Tools view is created, the extension SHALL migrate the legacy
`tsp.script_generation` setting if it holds any key. For each tool, the extension SHALL
compare the legacy sessions, in order, with the sessions in the new setting
(`I-V Characterization` sessions with `tsp.scriptGenSessions`, `Trigger Flow` sessions
with `tsp.triggerFlowSessions`), including sessions appended earlier in the same
migration. A legacy session whose name is not there SHALL be appended. A legacy session
with the same name and the same `config` SHALL count as migrated. A legacy session with
the same name and a different `config` SHALL be a conflict and SHALL NOT be migrated.
Sessions already in the new setting SHALL NOT be changed. The new setting SHALL be written
to workspace settings, keeping its other keys, only when at least one session is
appended. After the new settings are written, the legacy setting SHALL be removed from
workspace settings if no conflicts remain, and otherwise SHALL be replaced in workspace
settings with only the conflicting sessions. While conflicts remain, each activation
SHALL show a warning naming every conflicting session by tool, with an "Open Settings"
action that opens the workspace settings file. A failure SHALL be logged and SHALL NOT
stop activation.

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

#### Scenario: New setting already in use

- **WHEN** `tsp.script_generation` holds a `Trigger Flow` session `old` and
  `tsp.triggerFlowSessions` already holds `burst`
- **THEN** `tsp.triggerFlowSessions` holds `burst` followed by `old`, and
  `tsp.script_generation` is removed

#### Scenario: Identical session already migrated

- **WHEN** `tsp.script_generation` holds a `Trigger Flow` session `burst` and
  `tsp.triggerFlowSessions` holds `burst` with the same `config`
- **THEN** `tsp.triggerFlowSessions` is not written, `tsp.script_generation` is removed,
  and no warning is shown

#### Scenario: Conflicting session kept

- **WHEN** `tsp.script_generation` holds `I-V Characterization` sessions `sweep` and
  `pulse`, and `tsp.scriptGenSessions` holds `sweep` with a different `config`
- **THEN** `pulse` is appended to `tsp.scriptGenSessions`, the existing `sweep` is
  unchanged, `tsp.script_generation` holds only the legacy `sweep`, and a warning names
  `sweep`

#### Scenario: Conflict still present on next activation

- **WHEN** the extension activates again and the legacy `sweep` still conflicts
- **THEN** no setting is written and the warning is shown again

#### Scenario: Conflict resolved by the user

- **WHEN** the user renames the existing `sweep` to `sweep new` in settings and the
  extension activates again
- **THEN** the legacy `sweep` is appended to `tsp.scriptGenSessions`,
  `tsp.script_generation` is removed, and no warning is shown
