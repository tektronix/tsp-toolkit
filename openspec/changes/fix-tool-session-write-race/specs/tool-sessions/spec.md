# Spec Delta

## MODIFIED Requirements

### Requirement: Saving sessions reported by the backend

When the backend reports a new session, the extension SHALL store the reported
configuration under the name of the session open in the panel. If a session with that
name exists when the write runs, it SHALL replace that session's configuration.
Otherwise it SHALL append an entry and, once the write has finished, reveal and focus
the new item in the Tools view. When the backend reports an update, the extension SHALL
replace the configuration of the session with that name. If no such session exists when
the write runs, script generation SHALL ignore the update and TriggerFlow SHALL append a
new entry as for a new session. If no session name is set, the report SHALL be ignored.
The stored configuration SHALL be the reported payload from the first occurrence of
`{"request_type"` onward, or the whole payload if that text does not occur. The Tools
view SHALL refresh after the write has finished.

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

#### Scenario: Update right after a new script generation session

- **WHEN** the backend reports the new script generation session `sweep` and then an
  update, before the first write has finished
- **THEN** `tsp.scriptGenSessions` holds one `sweep` entry, with the updated
  configuration

#### Scenario: Update right after a new TriggerFlow session

- **WHEN** the backend reports the new TriggerFlow session `burst` and then an update,
  before the first write has finished
- **THEN** `tsp.triggerFlowSessions` holds exactly one `burst` entry, with the updated
  configuration

#### Scenario: New session reported twice

- **WHEN** the backend reports the new script generation session `sweep` twice in a row
- **THEN** `tsp.scriptGenSessions` holds one `sweep` entry, with the second
  configuration

## ADDED Requirements

### Requirement: Serialized session writes

Within a window, the changes the extension makes to `tsp.scriptGenSessions`, and the
changes it makes to `tsp.triggerFlowSessions`, SHALL each run one at a time per setting,
in the order they were requested, whichever part of the extension requests them. This
SHALL cover saving a reported new session, saving a reported update, deleting a session,
and deleting all sessions of a tool. Each change SHALL read the setting when its turn
comes and SHALL finish writing it before the next change to the same setting starts. A
change that fails SHALL be logged and SHALL NOT prevent later changes from running.
Changes to the two settings MAY run at the same time.

#### Scenario: Delete while an update is being written

- **WHEN** an update to the script generation session `pulse` is being written and the
  user deletes the session `sweep`
- **THEN** the deletion runs after the update has been written, and
  `tsp.scriptGenSessions` holds the updated `pulse` and no `sweep`

#### Scenario: Delete all after a pending save

- **WHEN** the panel reports an update to `burst` and the user then runs "TSP: Delete all
  TriggerFlow sessions" before the update has been written
- **THEN** the update is written first, and then `Trigger Flow` in
  `tsp.triggerFlowSessions` becomes an empty array

#### Scenario: A failed write

- **WHEN** writing an update to `tsp.scriptGenSessions` fails
- **THEN** the error is logged and the next queued change to that setting still runs
