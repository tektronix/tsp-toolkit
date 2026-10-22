# Spec Delta

## MODIFIED Requirements

### Requirement: Opening the manual for a block

When the panel asks to open the manual with a payload naming a `block_name`, as a JSON
string or an object, the extension SHALL look up the help page for that block in a fixed
map of trigger model block names to help pages. If the block is not in the map, the
extension SHALL show the information message `No manual page is available for <block>.`
and open nothing. Otherwise it SHALL choose the help folder from the active entry of
`tsp.tspLinkSystemConfigurations`: the first slot module, taking the local node's slots in
slot order and then each remote node's slots in stored order, whose folder in the help
documents contains the page. When no system is active, the active system has no slot
modules, or none of its modules' folders contains the page, the folder SHALL be
`MSMU60-2`. The extension SHALL open the help document `<folder>/<page>` beside the panel
with the block name as its title. A payload without a `block_name`, or one that is not
valid JSON, SHALL only be logged.

#### Scenario: Known block

- **WHEN** the active system has an MSMU60-2 in slot 1 and the panel asks to open the
  manual for the block `MEASURE`
- **THEN** the help document `MSMU60-2/114968.htm` opens beside the panel titled
  `MEASURE`

#### Scenario: Block on another module

- **WHEN** the active system's only slot module is an MPSU50-2ST and the panel asks to
  open the manual for `MEASURE`
- **THEN** the help document `MPSU50-2ST/114968.htm` opens

#### Scenario: Page missing from the first module

- **WHEN** the active system has an MPSU50-2ST in slot 1 and an MSMU200-2 in slot 2, and
  the panel asks to open the manual for `branch`
- **THEN** the help document `MSMU200-2/117325.htm` opens, because the MPSU50-2ST folder
  has no `117325.htm`

#### Scenario: No slot modules

- **WHEN** no system is active and the panel asks to open the manual for `MEASURE`
- **THEN** the help document `MSMU60-2/114968.htm` opens

#### Scenario: Unknown block

- **WHEN** the panel asks to open the manual for a block named `NEW BLOCK` that is not in
  the map
- **THEN** the message `No manual page is available for NEW BLOCK.` is shown and no help
  document opens
