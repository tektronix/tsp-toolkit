# Design

## Context

`Connection.exitConnection()` sends `.exit` and polls every 100 ms until
`this._terminal === undefined`. Only the `onDidCloseTerminal` handler registered in
`runConnectFlow()` clears `_terminal`. That handler matches the closed terminal against
this connection by icon, name, and `t.processId === this._terminal?.processId`. It then
sets the connection `Active` and clears `_terminal`. When the close reason is not
`TerminalExitReason.Process`, it also schedules `reset()` 500 ms later.

A terminal closed with `terminal.dispose()` reports a non-`Process` exit reason, so letting
the handler process a forced close would reset the instrument just as the debugger starts
connecting to it.

## Goals / Non-Goals

**Goals:**
- `exitConnection()` always settles, within about 5 s.
- A forced close leaves the connection in the same state as a normal `.exit` (terminal
  gone, `Active`, no reset).

**Non-Goals:**
- Making the wait configurable. The user chose a fixed value; `tsp.connectionTimeout`
  governs a different operation.
- Telling the user in a notification. The forced close is logged; the debugger starting is
  the visible outcome.
- Changing the reset-on-close behavior for any other close.

## Decisions

**1. Bounded wait, then force-close.**
Race the existing poll against a 5 s timer (a named constant next to the method). On
timeout, stop polling, log with `Log.warn`, and close the terminal. Alternative: cancel
debugging on timeout. Rejected by the user: a stuck REPL shouldn't block debugging.
Alternative: reuse `tsp.connectionTimeout`. Rejected: that setting defaults to 30 s and is
documented for connection attempts.

**2. Detach before disposing, so the close handler ignores it.**
On timeout, capture the terminal, set `this._terminal = undefined`, set
`this.status = ConnectionStatus.Active`, and only then call `dispose()` on the captured
terminal. When `onDidCloseTerminal` fires, `this._terminal?.processId` is `undefined` and
no longer matches, so the handler neither resets the instrument nor changes state again.
Alternative: add a "suppress next reset" flag checked in the handler. Rejected: it adds
state that has to be cleared on every path, and a stale flag would swallow a later
legitimate reset.

**3. Fire-and-forget dispose.**
`exitConnection()` doesn't wait for the close event after disposing. VS Code kills the
shell process on dispose, and the debugger's own `kic` process connects independently.

## Risks / Trade-offs

- [The terminal's `kic` process may still hold the instrument connection for a moment
  after dispose, so the debugger's first connect could fail] → Same outcome the user gets
  today after closing the terminal by hand. The debugger reports its own failure, and the
  user can retry.
- [5 s may be too short for a slow `.exit` (for example over a congested VISA link)] → The
  forced close is logged, so it can be found and the constant raised if needed.
- [Relying on the `processId` comparison to skip the handler couples this fix to that
  matching rule] → Called out in a code comment at the detach. If the handler's matching
  changes, this path must be rechecked.

## Migration Plan

None. Rollback is reverting the commit.
