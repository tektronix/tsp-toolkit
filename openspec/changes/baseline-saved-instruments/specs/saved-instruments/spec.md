# Spec Delta

## Purpose

Describes how the extension remembers instruments between sessions in the
`tsp.savedInstruments` setting: the stored entry format, how entries are loaded into the
Instruments view, which actions write or delete entries and what they write, and how saved
instruments are cleared. This is a baseline of current behavior, including known quirks.

## ADDED Requirements

### Requirement: Saved instrument storage

Saved instruments SHALL be stored in the `tsp.savedInstruments` setting, an array with
application scope (default `[]`), which the extension SHALL always write to user (global)
settings. Each entry SHALL describe one connection interface of one instrument with the
fields `io_type` (`Lan` or `Visa`), `instr_address`, `manufacturer`, `model`,
`serial_number`, `firmware_revision`, `instr_categ`, and `friendly_name`. An instrument
with several interfaces SHALL have one entry per interface, each repeating the instrument's
identity, name, and category.

#### Scenario: Instrument with LAN and VISA saved

- **WHEN** a 2450 named `bench` is saved with a LAN connection at `192.168.0.5` and a VISA
  connection at `USB0::0x05E6::0x2450::04412345::INSTR`
- **THEN** `tsp.savedInstruments` in user settings holds two entries with the same model,
  serial number, and `friendly_name` `bench`, one with `io_type` `Lan` and one with
  `io_type` `Visa`

#### Scenario: Workspace open

- **WHEN** a workspace with its own `.vscode/settings.json` is open and an instrument is
  saved
- **THEN** the entry is written to user settings, not to the workspace

### Requirement: Loading saved instruments

When the extension starts, and whenever `tsp.savedInstruments` changes, the extension SHALL
read the list and show each saved instrument in the Instruments view as `Saved`. An entry
for an instrument that is not yet in the view SHALL create it with the entry's connection.
Its name SHALL be the entry's `friendly_name`, or `<model>#<serial number>` when that is
empty. Entries with the same model and serial number SHALL become one instrument with one
connection per entry. Loaded connections SHALL count as not recently seen, so their status
is decided by the next refresh cycle (see `instrument-connection-lifecycle`). When the list
changes, a saved instrument that no longer has any entry SHALL be removed from the view.
Instruments that are only discovered SHALL stay.

#### Scenario: Startup with a saved offline instrument

- **WHEN** the extension starts with one saved entry for an instrument that is unplugged
- **THEN** the instrument appears as `Saved` under "Offline Instruments", named from its
  `friendly_name`

#### Scenario: Entry deleted by hand

- **WHEN** the user deletes every entry for a saved instrument from `settings.json`
- **THEN** that instrument is removed from the Instruments view, and discovered-only
  instruments are unaffected

#### Scenario: Entry added by hand

- **WHEN** the user adds an entry for an instrument that is not in the view
- **THEN** the instrument appears in the view as `Saved`

### Requirement: Writing an instrument's entries

Writing a saved instrument SHALL update `tsp.savedInstruments` as follows, and SHALL do
nothing for an instrument that is not `Saved`. First, for each of the instrument's
connections, add an entry unless one already exists with the same serial number and
`io_type` and either the same address or both being LAN. Then, for every entry with the
instrument's serial number:
- set `friendly_name` to the instrument's current name,
- set `firmware_revision` to the instrument's current firmware revision, unless that
  revision is `UNKNOWN`, in which case keep the stored value,
- set `instr_address` to the address of the instrument's connection with the same
  `io_type`.

Finally, remove later duplicates that have the same serial number, model, `io_type`, and
address, and write the list to user settings. Entries for other instruments SHALL be kept
unchanged. These rules describe instruments with at most one connection per interface
type.

#### Scenario: Instrument moves to a new LAN address

- **WHEN** a saved instrument stored at `192.168.0.5` is found at `192.168.0.9` and its
  entries are written
- **THEN** its LAN entry's address becomes `192.168.0.9`, and no second LAN entry is
  added

#### Scenario: New interface

- **WHEN** a saved instrument with only a LAN entry gains a VISA connection and its entries
  are written
- **THEN** a VISA entry with the instrument's identity, category, and name is added

#### Scenario: Firmware revision unknown

- **WHEN** the instrument's firmware revision is `UNKNOWN` and its entries are written
- **THEN** each stored `firmware_revision` keeps its previous value

### Requirement: When saved entries are written

The extension SHALL write a saved instrument's entries (as in "Writing an instrument's
entries") when the user saves it, when a connection attempt to it succeeds (see
`instrument-connection-lifecycle`), when it is renamed, when one of its addresses is
updated, and each time discovery reports it. At the end of every refresh cycle, the
extension SHALL write the entries of every saved instrument.

#### Scenario: Connecting saves

- **WHEN** the user connects to a discovered instrument that is not saved
- **THEN** it becomes `Saved` and its entries are added to `tsp.savedInstruments`

#### Scenario: Refresh keeps entries current

- **WHEN** a refresh cycle ends after a saved instrument reported a new firmware revision
- **THEN** its stored `firmware_revision` is updated

### Requirement: Saving an instrument

The Save action on an instrument that is not `Saved` SHALL mark it `Saved`, write its
entries, and refresh the Instruments view. Save SHALL NOT appear in the Command Palette.

#### Scenario: Save a discovered instrument

- **WHEN** the user clicks Save on a discovered instrument with one LAN connection
- **THEN** the instrument shows as `Saved` and one LAN entry for it is added to
  `tsp.savedInstruments`

### Requirement: Removing a saved instrument

The Remove action SHALL mark the instrument not saved, delete every `tsp.savedInstruments`
entry with its model and serial number, and remove the instrument from the Instruments
view, even if it is currently reachable. A reachable instrument SHALL then reappear as a
discovered (not saved) instrument the next time discovery reports it. If writing the
setting fails, the error SHALL be shown as an error message. Remove SHALL NOT appear in
the Command Palette.

#### Scenario: Remove an offline instrument

- **WHEN** the user removes a saved instrument that is offline
- **THEN** all of its entries are deleted and it disappears from the view

#### Scenario: Remove a reachable instrument

- **WHEN** the user removes a saved instrument that discovery can still see
- **THEN** it disappears from the view, then comes back as a discovered instrument after
  the next discovery pass, and `tsp.savedInstruments` has no entry for it

### Requirement: Renaming an instrument

Rename SHALL ask for a name in an input box with the placeholder "Enter new name". When the
user enters a non-empty name, the instrument SHALL take that name in the view and its
entries SHALL be written, so every entry's `friendly_name` becomes the new name. If the user
cancels or enters an empty name, nothing SHALL change. Names SHALL NOT be checked for
uniqueness.

#### Scenario: Rename

- **WHEN** the user renames a saved instrument to `bench-2`
- **THEN** the view shows `bench-2` and every entry for that instrument has
  `friendly_name` `bench-2`

#### Scenario: Rename cancelled

- **WHEN** the user presses Escape in the rename input box
- **THEN** the name and the saved entries are unchanged

### Requirement: Updating a connection address

Update address SHALL ask for "a valid IPv4 address or VISA resource string". Cancelled or
blank input SHALL change nothing. Input that is not a valid IP address or VISA resource
string SHALL show "Invalid IP address or VISA resource string" and change nothing.
Otherwise, the connection SHALL take the trimmed address, the instrument's entries SHALL be
written, and the status bar SHALL show "IP address updated to <address>".

#### Scenario: New LAN address

- **WHEN** the user updates a saved instrument's LAN connection to `10.0.0.20`
- **THEN** the connection shows `10.0.0.20`, the stored LAN entry's address becomes
  `10.0.0.20`, and the status bar confirms the change

#### Scenario: Invalid address

- **WHEN** the user enters `not-an-address`
- **THEN** "Invalid IP address or VISA resource string" is shown and nothing changes

### Requirement: Resetting saved instruments

Reset to Defaults SHALL offer a "Saved Instruments" item ("Delete saved instruments;
instruments with active connections are kept"). If selected and confirmed in the modal
"Reset" dialog, it SHALL delete every entry whose serial number does not belong to a saved
instrument with a `Connected` connection, and keep the rest. When there are no saved
entries, or every entry belongs to a connected instrument, the item SHALL be skipped and
nothing written. Instruments whose entries were deleted SHALL leave the view as in
"Loading saved instruments".

#### Scenario: Reset with one instrument connected

- **WHEN** two instruments are saved, one is `Connected`, and the user resets Saved
  Instruments
- **THEN** only the connected instrument's entries remain, and the other instrument leaves
  the view

#### Scenario: Nothing removable

- **WHEN** every saved instrument is `Connected` and the user resets Saved Instruments
- **THEN** `tsp.savedInstruments` is not written

### Requirement: Deprecated saved-instrument settings

On activation, for each of the deprecated settings `tsp.savedInstrumentList` and
`tsp.connectionList` that has a value, the extension SHALL show an information message
offering "Remove" and "Ignore". "Remove" SHALL clear the setting from user, workspace, and
workspace-folder settings and confirm with "Removed deprecated setting: <name>". "Ignore"
SHALL leave it. Values in deprecated settings SHALL NOT be migrated into
`tsp.savedInstruments`.

#### Scenario: Old list present

- **WHEN** the extension activates and `tsp.savedInstrumentList` has a value
- **THEN** a message names the setting as deprecated and offers Remove and Ignore, and no
  instruments are imported from it
