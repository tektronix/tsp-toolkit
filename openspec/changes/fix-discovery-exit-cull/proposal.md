# Proposal

## Why

When a discovery pass ends, the Instruments view is supposed to mark connections that have
not been seen recently as `Inactive`. The condition introduced in #325 is inverted: it
marks connections seen *within* the last 6 seconds as `Inactive` (unless they are
`Connected` or `Connecting`), which includes everything discovery just found. Reachable
instruments can therefore drop into "Offline Instruments" after every discovery pass and
come back on the next refresh, while stale connections are left alone. The baseline spec
(`instrument-connection-lifecycle`) recorded this as a known deviation that it
deliberately did not specify.

## What Changes

- At the end of a discovery pass, mark a connection `Inactive` only when it has **not**
  been seen within the cull window (6 seconds) and is not `Connected` or `Connecting`.
- Count a successful refresh probe (the instrument answers with the expected serial
  number) as "seen", not only discovery results. Without this, instruments that respond
  to the probe but that discovery does not report (for example, a saved LAN instrument on
  another subnet) would flicker between `Active` and `Inactive` once the cull works.
- Count a connection as seen when its instrument terminal closes, so that an instrument
  that was just in use is not culled before the next refresh can probe it.
- Use one shared staleness check for both the refresh step and the discovery-exit cull, so
  the two cannot drift apart again, and cover it with unit tests.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-connection-lifecycle`: the "Discovery and refresh" requirement gains the
  end-of-discovery cull rule and defines what counts as a connection being "seen".

## Impact

- Code: `src/instrumentProvider.ts` (discovery-exit cull), `src/connection.ts`
  (refresh probe and terminal-close bookkeeping), and a new vscode-free helper module
  with tests under `src/test/`.
- User-visible: discovered instruments stay in the main list between discovery passes;
  instruments that stop responding still move to "Offline Instruments" within a couple
  of refresh cycles.
- No settings, commands, menus, or `contextValue` strings change.
