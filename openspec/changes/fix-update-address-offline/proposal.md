# Proposal

## Why

Update address is meant for an instrument whose address has changed, but it is only
offered on connections that are `Active`. A saved instrument that moved to a new IP address
is unreachable at its stored address, so its connection is `Inactive` and the action is
never shown. The only way to fix the address is to edit `tsp.savedInstruments` by hand, and
the `saved-instruments` baseline records that hand edits to an instrument already in the
view are reverted.

## What Changes

- Offer Update address on `Enabled` connections that are `Inactive` as well as `Active`.
  It stays hidden while the connection is `Connecting` or `Connected`, and on `Disabled`
  connections.
- No change to what Update address does: it still validates the input, takes the trimmed
  address, and writes the instrument's saved entries. The next refresh cycle probes the
  new address as it does for any connection.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-connection-lifecycle`: the "Action availability by state" requirement shows
  Update address for `Inactive` connections too.

## Impact

- Code: the `InstrumentsExplorer.updateInstrumentAddr` entry in `view/item/context` in
  `package.json`. No TypeScript change is expected, because `updateInstrumentAddr()` in
  `src/instrumentExplorer.ts` does not check the connection status.
- User-visible: the edit action appears on connections under "Offline Instruments".
- `contextValue` strings don't change; only the `when` clause that matches them does.
- `fix-palette-instrument-commands` modifies the same requirement. Whichever change is
  archived second must carry the other's edit in its delta.
