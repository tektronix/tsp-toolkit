# Spec Delta

## MODIFIED Requirements

### Requirement: Action availability by state

The Instruments view SHALL offer inline actions according to these conditions (current
behavior, including that `Connecting` counts as "not connected"):

| Action | Item | Shown when |
|---|---|---|
| Rename | instrument | `Saved` and not `Connected` |
| Remove | instrument | `Saved` and not `Connected` |
| Save | instrument | not `Saved` |
| Start saving TSP output | instrument | `Connected` and not `Saving` |
| Stop saving TSP output | instrument | `Connected` and `Saving` |
| Save buffers to file | instrument | `Connected` |
| Update firmware | instrument | `Connected` |
| Open terminal (connect) | connection | `Enabled` and not `Connected` |
| Update address | connection | `Enabled` and either `Active` or `Inactive` |
| Reset | connection | `Enabled` and (`Connected` or `Active`) |
| Abort | connection | `Connected` |
| Show terminal | connection | `Connected` |

The Connect action in the view title SHALL always be shown. Its quick pick SHALL list
connections that are `Active`, `Connected`, or `Inactive` (not `Connecting`) and SHALL
accept a typed IP address or VISA resource string, validating it before connecting.
Open terminal, Update firmware, Save, and Remove SHALL NOT appear in the Command Palette.

#### Scenario: Instrument actions while connecting

- **WHEN** a saved instrument is `Connecting`
- **THEN** Rename and Remove are shown, and output, buffer, and firmware actions are not

#### Scenario: Connection actions while connecting

- **WHEN** a connection is `Connecting` and `Enabled`
- **THEN** Open terminal is shown, and Reset, Update address, Abort, and Show terminal are
  not

#### Scenario: Offline connection

- **WHEN** a saved instrument's connection is `Inactive` and `Enabled`
- **THEN** Open terminal and Update address are shown, and Reset, Abort, and Show terminal
  are not

#### Scenario: Disabled sibling of a connected interface

- **WHEN** a connection is `Disabled` because another connection of its instrument is
  `Connected`
- **THEN** none of the connection actions are shown for it

#### Scenario: Discovered instrument

- **WHEN** an instrument that is not saved is shown
- **THEN** Save is shown and Rename and Remove are not

#### Scenario: Invalid address typed into Connect

- **WHEN** the user types a string that is not a valid IP address or VISA resource string
  into the Connect quick pick
- **THEN** an error is shown and no connection attempt is made
