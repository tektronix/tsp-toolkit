# Design

## Context

"Seen" is tracked per connection as a `lastFound` timestamp, and the cull window is
`CULL_THRESHOLD_MS` (3 × `DISCOVERY_TIMEOUT` = 6 s, in `instrumentProvider.ts`). Four
places read or write it today:

| Where | What it does now |
|---|---|
| `InstrumentProvider.getContent()` line handler | sets `lastFound = now` and `Active` on each discovered connection (merged via `Instrument.addConnection()`, which also sets `lastFound = now`) |
| `InstrumentProvider.getContent()` exit handler | sets `Inactive` when `now - lastFound < CULL_THRESHOLD_MS` and not `Connected`/`Connecting` ← **inverted** |
| `Connection.getUpdatedStatus()` | pings; if `now - lastFound < CULL_THRESHOLD_MS` → `Active`; else `Active`/`Inactive` from the ping, and sets `lastFound = now` **only when the status changes** |
| `InstrumentProvider.getSavedInstruments()` | sets `lastFound = new Date(0)` on load |

Before #325 the equivalent state was a `foundLastRound` flag reset before every discovery
pass, and the exit handler culled `!foundLastRound && Active`. The move to a timestamp
kept the intent ("not found recently → cull") but flipped the comparison.

`connection.ts` and `instrumentProvider.ts` import `vscode`, so they can't be loaded under
plain mocha. Only vscode-free modules are unit-testable.

## Goals / Non-Goals

**Goals:**
- The exit cull targets stale connections only.
- Steady state is stable: a reachable instrument doesn't change status from one cycle to
  the next, whether discovery or the probe is what finds it.
- The staleness comparison lives in one tested place.

**Non-Goals:**
- Changing `DISCOVERY_TIMEOUT`, the 6 s window, the probe timeout, or the cycle cadence.
- Fixing the listener that `Instrument.addConnection()` registers on each temporary
  discovered connection. It's unrelated and is noted as a follow-up.
- Changing how status is aggregated or how the tree is grouped.

## Decisions

**1. Invert the exit-cull comparison: cull when stale (`>=` the window).**
This restores the pre-#325 intent. Alternative: remove the exit cull entirely and rely
on the refresh probe to mark stale connections `Inactive`. Rejected because the probe
only runs at the start of the next cycle, and because the exit cull is the only step
that culls a connection seen within the window but not re-found, once it ages out. Keeping
it makes discovery the authority for discovered interfaces.

**2. A successful probe records the connection as seen, every time.**
`getUpdatedStatus()` will set `lastFound = now` whenever the probe returns the expected
serial number, not only when the status changes. Without this, a probe-only instrument
(reachable, but never reported by discovery) would be culled at every discovery exit,
re-activated by the next probe, and cycle between the two states. Alternative:
exempt saved instruments from the exit cull. Rejected: that would keep an unplugged saved
instrument `Active` until a probe fails, and would tie liveness to the saved state.

**3. Terminal close records the connection as seen.**
When a connection's terminal closes it becomes `Active` (baseline behavior). If its
`lastFound` is old (for example, the probe failed while the session held the interface),
the next discovery exit would cull it before any probe could run. Setting
`lastFound = now` on close keeps the just-used instrument listed until the next refresh
decides.

**4. One vscode-free helper for staleness.**
Add `isStale(lastFound: Date, now: number, windowMs: number): boolean` in a new module
with no `vscode` import (for example `src/connectionFreshness.ts`), and use it in both
`getUpdatedStatus()` and the exit handler. This file is vscode-free, so `CULL_THRESHOLD_MS`
can't be imported into it; the window stays a parameter. Alternative: fix the comparison
in place and don't test it. Rejected, because two hand-written comparisons that must
agree are how this regressed in the first place.

## Risks / Trade-offs

- [The `readline` line events can arrive after the child's `exit` event, so a
  connection being reported in the current pass can be culled just before its line is
  handled] → Only for connections that were already stale. The line handler then sets them
  `Active` again. At worst this is one transient `Inactive`, the same as today for stale
  connections, and never affects fresh ones.
- [Probe-as-seen means a probe-only instrument is never culled by discovery] → Intended.
  Its liveness is decided by the probe, which marks it `Inactive` once it stops
  answering (after the window lapses).
- [Probes while `Connected` may fail if the session holds the interface] → Unchanged
  behavior. `Connected` is excluded from the cull, and Decision 3 covers the moment right
  after disconnect.
- Can't be verified end to end without instruments on the network. Unit tests cover the
  predicate, and a manual check is listed in the tasks.

## Migration Plan

None. The change is local to the extension and needs no migration of settings or state.
Rollback is reverting the commit.
