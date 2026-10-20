# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation: slot
modules are a fixed list in the code. Mainframe models come from the directories shipped
in `@tektronix/keithley_instrument_libraries`, but `src/resourceManager.ts` hard-codes
`MPSU50-2ST`, `MSMU60-2`, and `MSMU200-2`, both to filter them out of the model list and as
the MP5103's slot options. New modules are added to the package regularly. Until someone
also edits that list, each new module appears in the System Configurations view as a
mainframe model, can't be chosen for an MP5103 slot, and makes a fetched system that uses
it fail validation as an unsupported module.

## What Changes

- The extension identifies slot modules from the instrument-library package itself. A
  model directory whose command definitions are written per slot (they contain the
  slot-number placeholder the extension already substitutes when it generates
  `<MODULE>_slot<S>.lua`) is a slot module. Every other model directory is a mainframe
  model.
- Slot modules are never offered as local-node or remote-node models.
- The MP5103 offers `Empty` plus every slot module found in the package, in a stable
  (sorted) order. It still has 3 slots.
- Fetched systems and legacy migration are validated against the same derived list, so a
  newly shipped module is accepted without an extension change.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-link-system-configurations`: "Supported models and modules" says that slot modules
  are the module libraries shipped in the package, and that the MP5103 offers all of
  them.

## Impact

- Code: `src/resourceManager.ts` (`SUPPORTED_MODELS_DETAILS` and the hard-coded module
  constants). Consumers in `src/ConifgWebView.ts` and `src/systemConfig.js` already read
  `moduleOptions` and `noOfSlots` from that object, so their code doesn't change.
- Assumption: every slot module in the package fits the MP5103, which is the only slotted
  mainframe today. The package has no metadata saying which mainframe takes which
  modules, or how many slots a mainframe has. A future slotted mainframe with a different
  module set would need that metadata (see `design.md`).
- The order of the MP5103 module options becomes alphabetical, after `Empty`. Today it is
  `MPSU50-2ST`, `MSMU60-2`, `MSMU200-2`. Saved systems are unaffected, because they store
  module names.
- `tsp-link-system-configurations` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
