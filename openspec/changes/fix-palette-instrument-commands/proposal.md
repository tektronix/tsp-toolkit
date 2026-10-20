# Proposal

## Why

Rename and Update Instrument Address act on the instrument or connection they are invoked
on in the Instruments view, but unlike Save, Remove, and Update firmware they are not
hidden from the Command Palette. Run from the palette, they get no item. Rename still asks
for a name and then silently does nothing. Update address asks for an address and then
shows "Connection not defined". Either way, the user is prompted for input that can't be
used.

## What Changes

- Hide Rename and Update Instrument Address from the Command Palette, as Save, Remove, and
  Update firmware already are. They stay available in the Instruments view.
- Add a changelog entry under 1.6.0 → Fixed.

### Out of scope

- Show Terminal, Reset, Abort, Start/Stop saving TSP output, and Save buffers to file are
  also tree-item commands that appear in the Command Palette. Whether they work without an
  item, or should be hidden too, is left for a separate change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-connection-lifecycle`: "Action availability by state" adds Rename and Update
  address to the commands that don't appear in the Command Palette.
- `saved-instruments`: "Renaming an instrument" and "Updating a connection address" state
  that the action doesn't appear in the Command Palette, as "Saving an instrument" and
  "Removing a saved instrument" already do.

## Impact

- Code: two `when: "false"` entries in `contributes.menus.commandPalette` in
  `package.json`. No TypeScript change.
- User-visible: "Rename" and "Update Instrument Address" no longer appear in the Command
  Palette.
- `fix-update-address-offline` modifies "Action availability by state" too. Whichever
  change is archived second must carry the other's edit in its delta.
