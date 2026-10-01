# Proposal

## Why

The `instrument-terminal-operations` baseline recorded a known deviation: when the chosen
connection has no terminal, Update firmware connects first. If that connect fails, the
extension still shows "Starting update on <name>@<address>", even though no `.update` is
sent. The user is told an update started when nothing happened. The empty-file check also
runs only after the connect attempt, so an empty file can open a terminal for nothing.

## What Changes

- Check that the firmware file is not empty before any connection attempt.
- Show "Starting update on …" and send `.update` only when a terminal is open for the
  connection. When connecting fails or is cancelled, stop without further messages: the
  connect flow already reports its own error, warning, or cancellation.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-terminal-operations`: the "Updating firmware" requirement fixes the order of
  the empty-file check and the connect attempt, and states that nothing is reported or sent
  when the connect attempt fails.

## Impact

- Code: `src/connection.ts` (`Connection.update()`).
- User-visible: no false "Starting update" message; an empty firmware file is rejected
  without connecting.
- No settings, commands, menus, or `contextValue` strings change. In normal use the action
  is only shown for `Connected` instruments, so the failed-connect path is rare; it is still
  reachable when an instrument's `Connected` connection drops between the menu click and
  the file dialog.
