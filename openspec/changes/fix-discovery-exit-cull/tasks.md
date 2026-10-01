# Tasks

## 0. Diagnose why saved instruments are never culled

Pursue this before re-attempting sections 1–3. The first implementation was reverted on 2026-10-01 (see 4.2): saved instruments stayed online after they were unplugged, even though every probe failed and discovery reported nothing.

- [ ] 0.1 Add temporary `Log.trace` calls (using the usual `SourceLocation` pattern) at each place that changes a connection's status or `lastFound`. Each call should log serial number, address, connection type, `lastFound`, status before and after, and (for the probe) whether the ping returned the parent's serial number. Places to instrument: `Connection.getUpdatedStatus()`, the discovery `line` and `exit` handlers in `InstrumentProvider.getContent()`, the existing-address branch and status-forwarding listener in `Instrument.addConnection()`, `getSavedInstruments()`, and the terminal-close handler in `Connection.runConnectFlow()`. Verify with `npm run compile`.
- [ ] 0.2 With `tsp.autorefresh` on, run "Run Extension" with at least one saved instrument that has both a LAN and a VISA connection. Let it be discovered, unplug it, and wait several minutes. Use the trace output to find what keeps returning it to `Active` (or why the tree doesn't redraw). Suspects to confirm or rule out: the `sameTypeIdx` index captured by the `addConnection()` forwarding listener, which `updateStatus()` re-sorting can make point at the wrong connection; the `addr.substring(0, 3)` "same type" match; `updateSaved()` rewriting `tsp.savedInstruments` from the discovery line handler with the config watcher still on, which re-runs `getSavedInstruments()`; and a refresh cycle (~10 s observed) longer than the 6 s `CULL_THRESHOLD_MS` window. Record the finding here and update `design.md` before changing any fix code.
- [ ] 0.3 Remove the temporary trace logging, or keep only the lines worth leaving at `trace` level, before the fix is merged.

## 1. Shared staleness check

- [ ] 1.1 Add a vscode-free module (e.g. `src/connectionFreshness.ts`) exporting `isStale(lastFound: Date, now: number, windowMs: number): boolean`. It returns `true` when `now - lastFound >= windowMs`. Verify with `npm run compile`.
- [ ] 1.2 Add `src/test/connectionFreshness.test.ts` (TDD `suite`/`test`) covering a fresh timestamp, exactly at the window boundary, just past the window, and `new Date(0)`. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/connectionFreshness.test.ts`.

## 2. Discovery-exit cull and "seen" bookkeeping

- [ ] 2.1 In the discovery-exit handler in `InstrumentProvider.getContent()` (`src/instrumentProvider.ts`), cull only when `isStale(c.lastFound, Date.now(), CULL_THRESHOLD_MS)` and the connection is not `Connected`/`Connecting`. Verify by reading the diff: fresh connections are no longer set `Inactive`, and `npm run compile` passes.
- [ ] 2.2 In `Connection.getUpdatedStatus()` (`src/connection.ts`), replace the inline recent-window comparison with `!isStale(...)`, and set `lastFound = new Date()` whenever the probe returns the parent's serial number, not only when the status changes. Verify that `npm run compile` passes and the diff keeps the existing `Active`/`Inactive` outcomes.
- [ ] 2.3 In the terminal-close handler in `Connection.runConnectFlow()` (`src/connection.ts`), set `lastFound = new Date()` when the connection goes back to `Active`. Verify that `npm run compile` passes.

## 3. Changelog

- [ ] 3.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: discovered instruments no longer drop into "Offline Instruments" after each discovery pass. Verify that the section renders in Keep a Changelog order (Added before Fixed).

## 4. Integration checks

- [ ] 4.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that all three are clean. Result (first attempt, 2026-09-30, since reverted): lint, prettier and mocha were clean for the changed files. Mocha was 40 passing. The 25 lint warnings and 7 prettier files reported were already present at HEAD in files the change didn't touch. Re-run after the next attempt.
- [ ] 4.2 Manual check with the "Run Extension" launch config and a LAN instrument, with `tsp.autorefresh` on. Verify the instrument stays in the main list across several discovery passes. Verify it moves to "Offline Instruments" within about 10 s of being unplugged. Verify it stays `Active` after you close its terminal. Record the result, or note that no hardware was available. Result (first attempt, 2026-09-30): failed. Instruments appeared in the main list once connected and discovered. However, saved instruments (shown before they were connected) were never moved to "Offline Instruments" after being unplugged, even several minutes later. Logs showed every probe failing from about 18:59, and a manual discovery pass reported no instruments. The code changes were reverted; see section 0.
