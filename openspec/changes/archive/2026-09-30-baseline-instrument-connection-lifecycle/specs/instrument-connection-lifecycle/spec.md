# Spec Delta

## Purpose

Describes how instrument connections move between states in the Instruments view, how an
instrument's overall status is derived from its connections, and which actions the view
offers in each state. This is a baseline of current behavior, including known quirks.

## ADDED Requirements

### Requirement: Connection states

Each connection interface of an instrument (for example LAN or a VISA resource) SHALL have
exactly one status: `Inactive`, `Active`, `Connecting`, or `Connected`. `Inactive` means
the interface is not responding; `Active` means it was recently seen and can be connected
to; `Connecting` means a connection attempt is in progress; `Connected` means the
interface has an open instrument terminal. A connection SHALL additionally be either
`Enabled` or `Disabled`. A newly created connection SHALL start `Inactive` and `Enabled`.
An `Ignored` status exists but SHALL NOT be assigned to connection interfaces.

#### Scenario: New connection defaults

- **WHEN** a connection is created from a saved-instrument entry or a discovery result
- **THEN** its status is `Inactive` and it is `Enabled` until something else updates it

#### Scenario: Status icons

- **WHEN** a connection or instrument is shown in the Instruments view
- **THEN** `Inactive` (or unknown) shows a de-emphasized outline icon, `Active` an active
  icon, `Connecting` a spinning sync icon, and `Connected` a running icon in the
  "passed" color

### Requirement: Connecting to an instrument

When the user connects through a connection that has no open terminal, the connection
SHALL become `Connecting` and SHALL show a cancellable progress notification. The attempt
SHALL check whether the instrument requires authentication, query the instrument's
identity, add the instrument to the Instruments view, save it to the saved-instrument
list, and open an instrument terminal named after the instrument. The connection SHALL
become `Connected` once the terminal is created. When the connection already has an open
terminal, connecting SHALL only bring that terminal to the front.

#### Scenario: Successful connection

- **WHEN** the user connects to a reachable instrument that does not require login
- **THEN** the connection goes `Connecting` then `Connected`, a terminal named after the
  instrument opens and is shown, and the instrument is marked `Saved`

#### Scenario: Connecting to an already connected interface

- **WHEN** the user connects through a connection that already has an open terminal
- **THEN** no new attempt is made and the existing terminal is shown

#### Scenario: Reset and clear-error-queue settings

- **WHEN** a terminal is opened and `tsp.reset` or `tsp.clearErrorQueue` is `true`
- **THEN** the terminal session resets the instrument or clears its error queue,
  respectively, on connect

#### Scenario: Output capture is stopped by connecting

- **WHEN** a connection attempt starts on an instrument that is capturing TSP output
- **THEN** the instrument is no longer marked as capturing output

### Requirement: Failed or cancelled connection attempts

A connection attempt that does not complete SHALL return the connection to the status it
had before the attempt began, and no terminal SHALL remain open for it. The attempt SHALL
fail with an error message when the instrument is already in use elsewhere, when the
instrument cannot be reached, when its identity cannot be read, or after three incorrect
sets of login credentials (with a warning after each of the first two).

#### Scenario: Instrument in use

- **WHEN** the instrument reports that it is already in use
- **THEN** an error asks the user to log out at other locations, and the connection
  returns to its previous status

#### Scenario: Login attempts exhausted

- **WHEN** the instrument requires login and the user enters incorrect credentials three
  times
- **THEN** a warning is shown after attempts 1 and 2, an error after attempt 3, and the
  connection returns to its previous status

#### Scenario: User cancels

- **WHEN** the user cancels the progress notification at any point before the connection
  becomes `Connected`
- **THEN** any background process for the attempt is stopped, any terminal created for it
  is closed, and the connection returns to its previous status

### Requirement: Connection timeout

A connection attempt SHALL be cancelled after `tsp.connectionTimeout` seconds (default
30). A value of `0` SHALL disable the timeout. A negative or non-numeric value SHALL be
treated as 30. When the timeout fires first, a warning SHALL name the address, the
elapsed seconds, and the `tsp.connectionTimeout` setting. If the user cancels first, the
attempt SHALL be treated as a user cancellation.

#### Scenario: Timeout elapses

- **WHEN** `tsp.connectionTimeout` is 10 and the attempt has not completed after 10 seconds
- **THEN** a warning suggests checking reachability or increasing `tsp.connectionTimeout`,
  and the attempt is cancelled as in "Failed or cancelled connection attempts"

#### Scenario: Timeout disabled

- **WHEN** `tsp.connectionTimeout` is 0
- **THEN** the attempt runs until it completes, fails, or the user cancels it

#### Scenario: Invalid timeout value

- **WHEN** `tsp.connectionTimeout` is negative
- **THEN** a 30-second timeout is used

### Requirement: Connected while the terminal is open

A connection SHALL report `Connected` whenever its instrument terminal is open and has not
exited, regardless of status updates from discovery or refresh.

#### Scenario: Refresh during an open session

- **WHEN** a refresh cycle runs while a connection's terminal is open
- **THEN** the connection is still reported as `Connected`

### Requirement: Terminal close

When a connection's instrument terminal closes, the connection SHALL become `Active`. If
the terminal was closed by something other than its own process exiting (for example the
user closing it), the instrument SHALL be reset about 500 ms later.

#### Scenario: User closes the terminal

- **WHEN** the user closes a connected instrument's terminal
- **THEN** the connection becomes `Active` and the instrument is reset shortly afterwards

#### Scenario: Terminal process exits

- **WHEN** the terminal's process exits by itself
- **THEN** the connection becomes `Active` and no reset is sent

### Requirement: Instrument status aggregation

An instrument's status SHALL be derived from its connections with the precedence
`Connected` > `Connecting` > `Active` > `Inactive`: the highest status of any connection
wins, and an instrument with no `Active`, `Connecting`, or `Connected` connections is
`Inactive`. While the instrument is `Connected`, every connection that is not `Connected`
SHALL be `Disabled`; otherwise all of its connections SHALL be `Enabled`. Connections SHALL
be listed with higher statuses first, then by address.

#### Scenario: One interface connected

- **WHEN** an instrument has a `Connected` LAN connection and an `Active` VISA connection
- **THEN** the instrument is `Connected`, the LAN connection is `Enabled`, and the VISA
  connection is `Disabled`

#### Scenario: Disconnect re-enables interfaces

- **WHEN** the connected terminal closes and no connection is `Connected`
- **THEN** all of the instrument's connections are `Enabled` again

#### Scenario: Connecting outranks Active

- **WHEN** one connection is `Connecting` and another is `Active`
- **THEN** the instrument is `Connecting`

### Requirement: Instrument and connection identity

Instruments SHALL be identified by model and serial number; information about the same
model and serial number from discovery, saved settings, or a connection attempt SHALL be
merged into one instrument. Two connections of an instrument SHALL be treated as the same
interface when both are LAN, or when the first three characters of their addresses match.
A new address for an existing interface SHALL replace the old connection. An instrument
without a friendly name SHALL be named `<model>#<serial number>`. A discovered name SHALL
replace the current name only when the instrument is not saved.

#### Scenario: Instrument found again at a new LAN address

- **WHEN** discovery reports a known instrument at a different LAN address
- **THEN** the instrument keeps one LAN connection, now with the new address

#### Scenario: Unnamed instrument

- **WHEN** an instrument without a friendly name is added
- **THEN** it is shown as `<model>#<serial number>`

### Requirement: Discovery and refresh

With `tsp.autorefresh` enabled, the extension SHALL run a refresh cycle when it starts and
again 2 seconds after each cycle finishes. Turning `tsp.autorefresh` off SHALL stop
scheduling cycles; turning it on SHALL start them. With `tsp.autorefresh` disabled, a
Refresh action SHALL be shown in the Instruments view title and SHALL run one cycle. Each
cycle SHALL first update every known connection and then run a discovery pass (2-second
timeout). Connections reported by discovery SHALL become `Active` and be recorded as seen
now. During the update step, a connection seen within the last 6 seconds SHALL become
`Active`; any other connection SHALL become `Active` if a 1-second probe returns the
instrument's serial number and `Inactive` otherwise.

#### Scenario: Instrument appears on the network

- **WHEN** discovery reports an instrument that was `Inactive`
- **THEN** its reported connection becomes `Active` and the instrument moves out of
  "Offline Instruments"

#### Scenario: Instrument stops responding

- **WHEN** a connection has not been seen for more than 6 seconds and the probe gets no
  matching serial number
- **THEN** the connection becomes `Inactive`

#### Scenario: Manual refresh

- **WHEN** `tsp.autorefresh` is `false`
- **THEN** a Refresh action is shown in the Instruments view title and runs a single cycle

### Requirement: Instruments view grouping

The top level of the Instruments view SHALL list every instrument that is `Active`,
`Connecting`, or `Connected`, followed by a collapsed "Offline Instruments" group
containing the `Inactive` instruments. Each instrument SHALL be expanded to show its
connections and SHALL display its identity (manufacturer, model, serial number, firmware
revision) as its description and tooltip.

#### Scenario: Saved instrument that is offline

- **WHEN** a saved instrument has no responsive connections
- **THEN** it is listed under "Offline Instruments"

### Requirement: Tree item context values

Instrument and connection tree items SHALL expose a context value that menu `when` clauses
match. The instrument context value SHALL be `Instr` followed by `Versatest` or `Reg`
(from the model's category), then the instrument status (`Inactive`, `Active`,
`Connecting`, or `Connected`), then `Saved` or `Discovered`, then `Saving` while TSP
output is being captured. The connection context value SHALL be `CONN` followed by the
connection status, then `Enabled` or `Disabled`. Updating one part SHALL replace that
token in place without changing the others.

#### Scenario: Saved regular instrument connected and capturing output

- **WHEN** a saved non-Versatest instrument is `Connected` and capturing TSP output
- **THEN** its context value is `InstrRegConnectedSavedSaving`

#### Scenario: Disabled sibling connection

- **WHEN** an instrument is `Connected` through LAN and also has an `Active` VISA
  connection
- **THEN** the VISA connection's context value is `CONNActiveDisabled`

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
| Update address | connection | `Enabled`, `Active`, and not `Connected` |
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
