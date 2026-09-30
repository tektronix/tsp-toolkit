# Proposal

## Why

The Instruments view's behavior (connection states, the instrument status derived from
them, and which context-menu actions appear in each state) is an implicit contract. It is
encoded only in `contextValue` strings built by concatenation in `instrument.ts` and
`connection.ts` and matched by regex `when` clauses in `package.json`, so it is easy to
break without noticing. This change records the **current** behavior as a baseline spec so
that later changes can be expressed as deltas against it.

## What Changes

- Add a baseline spec for the instrument/connection lifecycle that describes behavior as
  it exists today, including quirks (for example, rename, remove, and open-terminal are
  available while a connection is `Connecting`).
- No code or behavior changes.

### Out of scope

- Saved-instrument persistence (`tsp.savedInstruments` merge, dedupe, and address-update
  rules). It is planned as a separate capability; this spec refers to saving and removing
  only where they affect state or menus.
- Script-gen / trigger-flow session tree items in the Tools view.

### Known deviations (not specified)

- **Discovery-exit culling appears inverted.** When the discovery process exits,
  `InstrumentProvider.getContent()` (`src/instrumentProvider.ts`) sets connections to
  `Inactive` when `Date.now() - lastFound < CULL_THRESHOLD_MS` and they are not
  `Connected`/`Connecting`, which targets the *most recently* found connections. The
  condition it replaced in #325 (`!c.foundLastRound && Active`) targeted connections *not*
  found in the last round. Whether this causes visible flicker is unconfirmed: readline
  `line` events may arrive after the process `exit` event, and the next refresh's
  `getUpdatedStatus()` sets recently found connections back to `Active`. The baseline spec
  deliberately does not encode this behavior; it should be investigated and fixed or
  specified in a follow-up change.

## Capabilities

### New Capabilities

- `instrument-connection-lifecycle`: connection states and transitions (discovery,
  refresh, connect, timeout, terminal close), instrument status aggregation, instrument
  and connection identity, Instruments-view grouping, the `contextValue` grammar, and
  per-state action availability.

### Modified Capabilities

None.

## Impact

- Documentation only: adds `openspec/specs/instrument-connection-lifecycle/spec.md` on
  archive.
- Describes behavior in `src/connection.ts`, `src/instrument.ts`,
  `src/instrumentProvider.ts`, `src/instrumentExplorer.ts`, and the
  `contributes.menus` / `contributes.configuration` sections of `package.json`. Future
  edits to those areas, especially renaming state strings, should be checked against this
  spec.
