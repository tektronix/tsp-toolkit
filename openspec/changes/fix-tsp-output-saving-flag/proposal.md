# Proposal

## Why

The `instrument-terminal-operations` baseline recorded a known deviation: start saving
TSP output marks the instrument `Saving` before it asks which connection to use. If the
user dismisses the "Which connection?" quick pick, the instrument stays `Saving` even
though no `.save --tsp` was sent. The Instruments view then shows Stop saving instead of
Start saving, and that state no longer matches the terminal.

## What Changes

- Mark the instrument `Saving` only after `.save --tsp --output "<output>"` has been
  sent to a terminal. If the flow ends early for any reason (quick pick dismissed, save
  dialog cancelled, connection failed), the instrument is left as it was.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-terminal-operations`: the "Capturing TSP output" requirement says when the
  `Saving` mark is set, and adds a scenario for dismissing the connection picker.

## Impact

- Code: `src/instrument.ts` (`startSaveTspOutput()`). `src/connection.ts`
  (`startTspOutputSaving()`) needs to report whether the command was sent.
- User-visible: after an abandoned start, the Instruments view keeps offering Start
  saving TSP output.
- No settings, commands, menus, or `contextValue` grammar change. `Saving` is still the
  token, it is just set later.
