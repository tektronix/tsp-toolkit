# Design

## Context

`updateLuaLibraryConfigurations()` in `src/workspaceManager.ts` is called from two places:
`configure_initial_workspace_configurations()` on activation, and the
`onDidChangeConfiguration` listener in the `ConfigWebView` constructor whenever
`tsp.tspLinkSystemConfigurations` changes. Each call reads the setting, clears the
generated-definitions folder, appends to `commonTables.lua` in several steps, sleeps 2
seconds, and writes `Lua.workspace.library`. The calls share no state, so two calls
interleave at every `await`.

## Goals / Non-Goals

**Goals:**

- At most one regeneration in flight per extension host.
- The last regeneration to finish always reflects the setting's latest value.

**Non-Goals:**

- Changing the regeneration steps, including the empty-then-fill update of
  `Lua.workspace.library` and the 2-second wait.
- Coordinating between windows. Each window has its own extension host. Windows sharing
  one generated folder is handled by `fix-shared-generated-definitions`.

## Decisions

### Single-flight runner with a pending flag

Add a module-level runner in `workspaceManager.ts`, for example
`requestLuaLibraryRegeneration()`. It keeps two pieces of state: the promise of the
running regeneration (or none) and a `pending` flag.

- When nothing is running, it starts `updateLuaLibraryConfigurations()` and stores the
  promise.
- When a run is in progress, it sets `pending = true` and returns a promise that settles
  when the follow-up run finishes.
- When a run finishes, whether it succeeded or failed, the runner checks `pending`. If it
  is set, the runner clears it and starts one more run. Otherwise it clears the stored
  promise.

Each run reads the setting when it starts, so the follow-up run sees every change made
during the previous run. Both callers switch to the runner, and
`updateLuaLibraryConfigurations()` becomes module-private so new callers can't bypass it.

The coordination logic doesn't depend on `vscode`, so it goes in a small helper (for
example `createSingleFlight(run)`) in its own file, where plain mocha can test it.

Alternatives considered:

- **Debounce the listener** (for example 500 ms). This cuts the number of runs, but a
  write that arrives during a run's 2-second wait still overlaps it. A debounce would
  still need the single-flight runner to be correct, so on its own it fixes nothing.
- **Cancel the running regeneration.** The file writes are synchronous, so the only
  cancellation point would be the 2-second wait, and partial output would still need
  cleaning up. Letting the run finish and following it with one more is simpler and
  always correct.
- **Queue every request.** Every queued run after the first would read the same latest
  setting, so the extra runs would only add delay.

### Errors don't block the queue

`updateLuaLibraryConfigurations()` already catches and logs a failed run. The runner also
catches anything that escapes, so a pending follow-up still runs and the next request
still starts a new run.

## Risks / Trade-offs

- [A burst of edits now takes up to two full runs, about 4 seconds, before the library
  list settles] → This is no slower than today's overlapping runs, and the result no
  longer depends on timing.
- [The run started on activation can delay the first regeneration after a user edit] →
  The follow-up run covers the edit. Only the delay changes.
