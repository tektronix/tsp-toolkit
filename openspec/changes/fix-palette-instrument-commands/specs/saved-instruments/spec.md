# Spec Delta

## MODIFIED Requirements

### Requirement: Renaming an instrument

Rename SHALL ask for a name in an input box with the placeholder "Enter new name". When the
user enters a non-empty name, the instrument SHALL take that name in the view and its
entries SHALL be written, so every entry's `friendly_name` becomes the new name. If the user
cancels or enters an empty name, nothing SHALL change. Names SHALL NOT be checked for
uniqueness. Rename SHALL NOT appear in the Command Palette.

#### Scenario: Rename

- **WHEN** the user renames a saved instrument to `bench-2`
- **THEN** the view shows `bench-2` and every entry for that instrument has
  `friendly_name` `bench-2`

#### Scenario: Rename cancelled

- **WHEN** the user presses Escape in the rename input box
- **THEN** the name and the saved entries are unchanged

#### Scenario: Rename not in the Command Palette

- **WHEN** the user searches the Command Palette for "Rename"
- **THEN** the Instruments view's Rename command is not listed

### Requirement: Updating a connection address

Update address SHALL ask for "a valid IPv4 address or VISA resource string". Cancelled or
blank input SHALL change nothing. Input that is not a valid IP address or VISA resource
string SHALL show "Invalid IP address or VISA resource string" and change nothing.
Otherwise, the connection SHALL take the trimmed address, the instrument's entries SHALL be
written, and the status bar SHALL show "IP address updated to <address>". Update address
SHALL NOT appear in the Command Palette.

#### Scenario: New LAN address

- **WHEN** the user updates a saved instrument's LAN connection to `10.0.0.20`
- **THEN** the connection shows `10.0.0.20`, the stored LAN entry's address becomes
  `10.0.0.20`, and the status bar confirms the change

#### Scenario: Invalid address

- **WHEN** the user enters `not-an-address`
- **THEN** "Invalid IP address or VISA resource string" is shown and nothing changes

#### Scenario: Update address not in the Command Palette

- **WHEN** the user searches the Command Palette for "Update Instrument Address"
- **THEN** the command is not listed
