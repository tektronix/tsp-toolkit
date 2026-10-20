# Spec Delta

## MODIFIED Requirements

### Requirement: Supported models and modules

The extension SHALL treat a library shipped in the instrument-library package as a slot
module when its command definitions are written per slot, and as a mainframe model
otherwise. The set of slot modules SHALL come from the package contents, so a module
added in a package release is recognized without a change to the extension. The models
offered for the local node and for remote nodes SHALL be the mainframe models, excluding
the base Lua library and the generated definitions folder. Slot modules SHALL NOT be
offered as models. The MP5103 SHALL offer 3 slots, each taking `Empty` or any slot module
shipped in the package, with `Empty` first and the modules in alphabetical order. Other
models SHALL offer no slots. Fetched and migrated systems SHALL be validated against the
same models and modules. Node numbers SHALL be selectable from 1 to 63.

#### Scenario: Choosing an MP5103 local node

- **WHEN** the user picks MP5103 as the local node
- **THEN** three slot selectors appear, each offering `Empty` followed by every slot
  module shipped in the package, in alphabetical order

#### Scenario: Slot modules are not offered as models

- **WHEN** the user opens the local node or remote node model list
- **THEN** no slot module, such as `MSMU60-2`, appears in the list

#### Scenario: New module in a package release

- **WHEN** the instrument-library package adds a slot-module library `MSMU100-4` and the
  extension is otherwise unchanged
- **THEN** `MSMU100-4` is offered in every MP5103 slot, is not offered as a model, and a
  fetched MP5103 system with `MSMU100-4` in a slot passes module validation

#### Scenario: Choosing a model without slots

- **WHEN** the user picks a 2450 as a remote node
- **THEN** no slot selectors appear for that node
