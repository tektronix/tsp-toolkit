# Spec Delta

## MODIFIED Requirements

### Requirement: Leaving the terminal for debugging

Before a debug session starts on a connection, the extension SHALL send `.exit` to that
connection's terminal, if it has one, and SHALL wait for the terminal to close for at most
5 seconds. When the terminal closes in time, its process has exited by itself, so no reset
is sent (see Terminal close in `instrument-connection-lifecycle`). When it has not closed
after 5 seconds, the extension SHALL log a warning, close the terminal itself, make the
connection `Active`, and continue starting the debugger. That forced close SHALL NOT reset
the instrument. After debugging, the extension API SHALL reconnect the same connection
using the terminal name it had before.

#### Scenario: Debug while connected

- **WHEN** the user starts debugging a TSP file on a `Connected` connection
- **THEN** `.exit` is sent, the debugger starts only after the terminal closes, and the
  instrument is not reset

#### Scenario: Terminal does not exit

- **WHEN** the user starts debugging and the terminal is still open 5 seconds after `.exit`
  was sent
- **THEN** a warning is logged, the terminal is closed, the connection becomes `Active`,
  the debugger starts, and the instrument is not reset
