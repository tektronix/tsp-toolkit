# Proposal

## Why

Everything the extension does to a connected instrument goes through two channels: dot
commands typed into the instrument terminal (`.reset`, `.abort`, `.script`, `.save`,
`.update`, `.nodes`, `.exit`) and one-shot `kic` processes spawned in the background
(`check-login`, `login`, `ping`, `info`, `reset`, `abort`, `dump`). Which channel each
operation uses, what it does when no terminal is open, and how it finds the target
terminal are implicit in `connection.ts`, `instrument.ts`, and `extension.ts`. A change to
the `kic` CLI or to any of those files can break this without anyone noticing. This change
records the **current** behavior as a baseline spec, so later changes can be written as
deltas against it.

## What Changes

- Add a baseline spec for the instrument terminal (REPL) and one-shot operations as they
  behave today, quirks included. For example, the "Reset complete" message appears as
  soon as `.reset` is sent, without waiting for the instrument.
- No code or behavior changes.

### Out of scope

- The connect flow itself (state transitions, login retries, timeout, cancellation,
  terminal close and the reset that follows it). `instrument-connection-lifecycle`
  already specifies these. This spec covers only the terminal's command line and what
  runs over the terminal once it is open.
- Discovery (`DISCOVER_EXECUTABLE`) and the debugger's own process
  (`DEBUG_EXECUTABLE`). The handoff that closes the terminal before debugging is in scope.
- The TSP-Link node file that `.nodes` writes, and how `workspaceManager.ts` uses it.

### Known deviations (not specified)

These are recorded here and deliberately left out of the spec, so the baseline does not
lock them in:

- **Start saving TSP output can leave the `Saving` flag set.** `startSaveTspOutput()`
  marks the instrument `Saving` before it asks which connection to use. If the user then
  dismisses the connection quick pick, the flag stays set even though no `.save --tsp`
  was sent. Dismissing the save dialog does clear it.
- **Firmware update reports success after a failed connect.** If the chosen connection
  has no terminal, `update()` connects first. If that connect fails, the
  "Starting update on …" message still appears, and no `.update` is sent.
- **An empty delimiter silently cancels Save buffers.** Pressing Escape on the delimiter
  prompt falls back to `,`. Accepting an empty string ends the flow with no message.
- **Leaving the terminal before debugging can wait forever.** `exitConnection()` sends
  `.exit` and checks every 100 ms for the terminal to close, with no timeout.

## Capabilities

### New Capabilities

- `instrument-terminal-operations`: the instrument terminal's command line and options,
  how a command finds its target connection (active toolkit terminal or connection
  picker), the dot commands sent for script, output-capture, buffer, firmware, node, and
  exit operations, and the one-shot background processes used when no terminal is open
  (including how they are serialized, logged, and terminated).

### Modified Capabilities

None.

## Impact

- Documentation only: on archive, adds
  `openspec/specs/instrument-terminal-operations/spec.md`.
- Describes behavior in `src/connection.ts`, `src/instrument.ts`, `src/extension.ts`
  (`createTerminal`, `pickConnection`, `getActiveConnection`, the `base_api` terminal
  helpers, and the command callbacks), `src/activateTspDebug.ts` (exit before debugging),
  and the `contributes.commands` / `contributes.menus` entries in `package.json` for
  these commands. The spec also depends on the `kic` CLI's subcommands, dot commands, and
  `check-login` exit codes. A `kic` version bump that changes any of them should be
  checked against it.
