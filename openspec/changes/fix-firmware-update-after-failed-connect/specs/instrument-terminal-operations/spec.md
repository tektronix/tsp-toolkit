# Spec Delta

## MODIFIED Requirements

### Requirement: Updating firmware

Update firmware SHALL ask for a firmware file (`.x` or `.upg`) with an open dialog labeled
"Update". For a Versatest instrument it SHALL first ask "What do you want to update?" and
offer "Mainframe" plus "Slot 1" to "Slot 3" for the MP5103 and TSPop, or only "Mainframe"
for other Versatest models. Non-Versatest instruments SHALL get no slot prompt. If the
selected file is empty, it SHALL show "Firmware file is empty (0 bytes)" and send nothing,
without attempting to connect. Otherwise, if the connection has no terminal, it SHALL
connect first; if that connect attempt does not succeed, it SHALL send nothing and show no
message beyond those of the connect attempt. With a terminal open, it SHALL show "Starting
update on <name>@<address>" (with ", slot <n>" when a slot was chosen) and send
`.update "<file>"`, or `.update --slot <n> "<file>"` for a slot. Update firmware SHALL NOT
appear in the Command Palette.

#### Scenario: Regular instrument update

- **WHEN** the user updates a connected 2450 with `fw.upg`
- **THEN** no slot prompt is shown, "Starting update on <name>@<address>" is shown, and
  `.update "<path>/fw.upg"` is sent

#### Scenario: MP5103 slot update

- **WHEN** the user updates an MP5103, chooses "Slot 2", and picks `fw.x`
- **THEN** `.update --slot 2 "<path>/fw.x"` is sent

#### Scenario: Empty firmware file

- **WHEN** the selected firmware file is 0 bytes
- **THEN** "Firmware file is empty (0 bytes)" is shown, nothing is sent, and no connection
  attempt is made

#### Scenario: Connect attempt fails

- **WHEN** the selected connection has no terminal and connecting to it fails or is
  cancelled
- **THEN** "Starting update on …" is not shown and no `.update` is sent
