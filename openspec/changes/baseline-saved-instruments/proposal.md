# Proposal

## Why

The extension remembers instruments in the user-level `tsp.savedInstruments` setting. When
it adds, merges, rewrites, deduplicates, and removes entries in that list, the rules live
only in `instrumentProvider.ts` and `instrumentExplorer.ts`, and several code paths write
the list (save, connect, rename, update address, every refresh cycle, and Reset to
Defaults). `instrument-connection-lifecycle` deliberately left persistence out and planned
it as a separate capability. This change records the **current** behavior as that baseline,
so later changes can be written as deltas against it.

## What Changes

- Add a baseline spec for saved-instrument persistence as it behaves today, quirks
  included. For example, Remove drops the instrument from the view even when it is
  reachable; it comes back as a discovered instrument on the next discovery pass.
- No code or behavior changes.

### Out of scope

- Connection states, identity merging, view grouping, the `Saved`/`Discovered`
  context-value token, and which menus appear for saved instruments. These are already in
  `instrument-connection-lifecycle`. This spec covers what is stored and when it is written.
- Script-gen and trigger-flow sessions, which are stored in other settings.
- `tsp.tspLinkSystemConfigurations`, except that it sits in the same Reset to Defaults
  picker.

### Known deviations (not specified)

These are recorded here and deliberately left out of the spec, so the baseline does not
lock them in:

- **A second VISA interface is not kept.** When an instrument has two VISA connections
  (for example USB and GPIB), every write first adds an entry for each, then rewrites every
  VISA entry for that serial number to the address of the first VISA connection, and then
  removes the duplicate. Only one VISA address survives each write.
- **Hand edits to an instrument already in the view are reverted.** Reloading the setting
  maps each entry to the instrument already in the view and ignores the entry's name and
  address. The next write (at the latest the end of the next refresh cycle) then writes the
  in-memory name and addresses back over the edit. Adding or removing whole instruments by
  hand does work.

### Note for `fix-discovery-exit-cull`

The extension tries to stop its own writes from triggering a reload of the setting, but
re-enables the change listener before the asynchronous write completes, so every write
still reloads the list. Each reload resets "last seen" on every saved connection. That
isn't visible on its own, so it is not specified here, but it is one of the suspects in
section 0 of `fix-discovery-exit-cull`.

## Capabilities

### New Capabilities

- `saved-instruments`: the `tsp.savedInstruments` entry format and where it is stored, how
  saved entries are loaded and reloaded into the Instruments view, what saving, connecting,
  refreshing, renaming, and updating an address write to the list (including merge,
  firmware, and duplicate rules), what Remove deletes, the Saved Instruments option of
  Reset to Defaults, and the prompt for deprecated predecessor settings.

### Modified Capabilities

None.

## Impact

- Documentation only: on archive, adds `openspec/specs/saved-instruments/spec.md`.
- Describes behavior in `src/instrumentProvider.ts` (`updateSaved`, `getSavedInstruments`,
  `removeSavedList`, `saveInstrument`, `refresh`, the config watcher, and the discovery line
  handler), `src/instrumentExplorer.ts` (save, remove, rename, update address),
  `src/instrument.ts` (`Instrument.from`), and `src/extension.ts` (Reset to Defaults and
  `updateExtensionSettings`), plus `contributes.configuration` in `package.json`.
- `saveInstrumentToList()` in `instrumentProvider.ts` is never called, so the spec does not
  describe it (it is the only code that would write `socket_port`).
