# Spec Delta

## MODIFIED Requirements

### Requirement: Session storage

Script generation sessions SHALL be stored in the `tsp.scriptGenSessions` setting under
the key `I-V Characterization`. TriggerFlow sessions SHALL be stored in the
`tsp.triggerFlowSessions` setting under the key `Trigger Flow`. Both settings SHALL be
window-scoped objects. Each key SHALL hold an array of entries, each with a `name` and a
`config` string that the extension stores without interpreting it. The extension SHALL
list, open, count, and change only the sessions stored in workspace settings, and SHALL
ignore any value of these settings in user settings. Every change the extension makes
SHALL read the setting's workspace value, change it, and write the whole object back to
workspace settings.

#### Scenario: One saved session of each tool

- **WHEN** the user has one script generation session `sweep` and one TriggerFlow session
  `burst`
- **THEN** the workspace `.vscode/settings.json` holds `tsp.scriptGenSessions` with
  `I-V Characterization` containing an entry named `sweep`, and
  `tsp.triggerFlowSessions` with `Trigger Flow` containing an entry named `burst`

#### Scenario: Session only in user settings

- **WHEN** user settings hold a script generation session `shared` and the workspace
  holds no `tsp.scriptGenSessions`
- **THEN** the "I-V Characterization Script Generation" node lists no sessions, and Reset
  to Defaults skips "Delete Script Generation Sessions"

#### Scenario: Saving does not copy user sessions

- **WHEN** user settings hold a TriggerFlow session `shared`, the workspace holds none,
  and the backend reports the new TriggerFlow session `burst`
- **THEN** workspace settings hold `tsp.triggerFlowSessions` with only `burst`, and user
  settings are unchanged
