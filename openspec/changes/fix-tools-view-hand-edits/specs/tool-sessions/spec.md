# Spec Delta

## MODIFIED Requirements

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
inactive, after `tsp.tspLinkSystemConfigurations` changes, and after
`tsp.scriptGenSessions` or `tsp.triggerFlowSessions` changes in any way, including edits
made outside the extension. For script generation it SHALL also refresh after
`tsp.lineFrequency` changes. When the entry of the session open in a tool's panel is
removed outside the extension, its item SHALL disappear from the view, and the panel SHALL
stay open with the same current session.

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

#### Scenario: Session renamed by hand

- **WHEN** the user changes the `name` of the script generation session `sweep` to
  `sweep2` in `settings.json` and saves the file
- **THEN** the Tools view lists `sweep2` and no longer lists `sweep`

#### Scenario: Session added by hand

- **WHEN** a source-control checkout adds a TriggerFlow session `burst` to the workspace
  settings
- **THEN** `burst` appears under the TriggerFlow node without any other action

#### Scenario: Open session removed by hand

- **WHEN** the TriggerFlow session `burst` is open in the panel and the user deletes its
  entry from `settings.json`
- **THEN** `burst` disappears from the Tools view, and the TriggerFlow panel stays open
  for `burst`
