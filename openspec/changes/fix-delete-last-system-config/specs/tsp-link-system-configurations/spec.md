# Spec Delta

## MODIFIED Requirements

### Requirement: Deleting a system

The delete icon next to the selector SHALL remove every entry whose name matches the
selected system, without confirmation. If any systems remain, the view SHALL then select
the first remaining system, and the extension SHALL activate it, whether or not the deleted
system was the active one. If no systems remain, the view SHALL show its empty state, and
the extension SHALL NOT activate any system, show an activation message, or fail.

#### Scenario: Delete the active system

- **WHEN** `bench`, `lab`, and `rack` are saved, `lab` is active, and the user deletes
  `lab`
- **THEN** `lab` is removed and `bench` becomes active

#### Scenario: Delete an inactive system

- **WHEN** `bench`, `lab`, and `rack` are saved, `rack` is active, and the user deletes
  `lab`
- **THEN** `lab` is removed and `bench` becomes active in place of `rack`

#### Scenario: Delete the last system

- **WHEN** only `bench` is saved and the user deletes it
- **THEN** the setting becomes `[]`, the view shows its empty state, no activation message
  is shown, and no error is logged
