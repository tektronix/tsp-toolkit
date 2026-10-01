# Proposal

## Why

The `instrument-terminal-operations` baseline recorded a known deviation: before a debug
session starts, the extension sends `.exit` to the connection's terminal and then checks
every 100 ms, with no timeout, for the terminal to close. If the terminal's `kic` process
does not exit (it is busy, hung, or the instrument stopped answering), the debug command
never finishes and the debugger never starts. The user gets no message and has to close
the terminal by hand.

## What Changes

- Wait at most 5 seconds for the terminal to close after `.exit`. If it is still open,
  log a warning, close the terminal from the extension, and start the debugger anyway.
- Closing the terminal this way SHALL NOT trigger the reset that normally follows a
  terminal the user closes, since the debugger is about to take over the instrument.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-terminal-operations`: the "Leaving the terminal for debugging" requirement
  gains the 5-second limit and the forced close.

## Impact

- Code: `src/connection.ts` (`Connection.exitConnection()`). `src/activateTspDebug.ts`
  keeps calling it the same way.
- User-visible: debugging starts within about 5 seconds even when the terminal doesn't
  respond to `.exit`.
- No settings, commands, menus, or `contextValue` strings change. The wait is a fixed
  constant, not a new setting.
- `instrument-connection-lifecycle` "Terminal close" (reset after a non-process close) is
  not changed for any other kind of close.
