# Spec Delta

## MODIFIED Requirements

### Requirement: Tool backends

Script generation SHALL use the `SCRIPT_GEN_EXECUTABLE` exported by
`@tektronix/script-gen-<platform>-<arch>`, port 27950, and the panel title "TSP Script
Generation". TriggerFlow SHALL use the `TRIGGER_FLOW_EXECUTABLE` exported by
`@tektronix/trigger-flow-<platform>-<arch>`, port 27951, and the panel title
"TriggerFlow®". Each tool SHALL have at most one backend process and at most one panel per
window. A backend SHALL be started, with no arguments, only when that tool has no process
yet or its process has exited or been killed, and nothing already accepts connections on
`127.0.0.1:<port>`. Every message to a backend SHALL be one line of text written to its
stdin, and SHALL be sent only while the extension holds a process for that tool. The
backend's stdout and stderr SHALL only be logged to the console.

#### Scenario: Backend already running

- **WHEN** the script generation backend is running and the user opens another script
  generation session
- **THEN** no second backend process is started

#### Scenario: Port already in use

- **WHEN** the extension holds no TriggerFlow process and another program, such as
  TriggerFlow in another VS Code window, listens on port 27951
- **THEN** no TriggerFlow backend is started

### Requirement: Opening a tool panel

Opening a tool's panel when it already exists SHALL reveal it. Otherwise the extension
SHALL create the panel in the first editor column with scripts enabled and its content
kept while hidden, then request `http://127.0.0.1:<port>` every 500 ms until a request
succeeds or 10 seconds have passed. On success it SHALL load the HTML returned by the
server into the panel, and only then SHALL it start handling messages from the panel,
sending theme refresh signals, and watching for the panel to close. If the server does not
answer in time or the HTML cannot be loaded, the panel SHALL show "Error starting server
or loading content". If the backend cannot be started, the panel, when open, SHALL show
"Error starting <tool> executable", where `<tool>` is "I-V Characterization" or "Trigger
Flow". If the backend process exits before its server answers, the extension SHALL stop
waiting and the panel SHALL show "<title> stopped before it was ready", where `<title>` is
the tool's panel title.

If the backend was not started because the tool's port is in use, the extension SHALL NOT
request or load anything from that port. It SHALL show the panel with the text "Port
<port> is already in use", show the error message "<title> could not start because port
<port> is already in use, probably by <title> in another VS Code window. Close <title>
there and try again.", and SHALL NOT mark the session active or send the backend any
message. Closing that panel SHALL leave nothing to clean up, so the next attempt checks
the port again.

#### Scenario: Server ready

- **WHEN** the user creates a TriggerFlow session and the backend's server answers within
  10 seconds
- **THEN** a "TriggerFlow®" panel opens showing the page served on port 27951

#### Scenario: Server never answers

- **WHEN** the script generation server does not answer within 10 seconds
- **THEN** the panel shows "Error starting server or loading content"

#### Scenario: Tool open in another window

- **WHEN** script generation is open in one VS Code window and the user opens a script
  generation session in a second window
- **THEN** the second window's panel shows "Port 27950 is already in use", an error
  message tells the user to close TSP Script Generation in the other window, and the
  first window's page is not loaded

#### Scenario: Retry after closing the other window's tool

- **WHEN** the port was in use, the user closes the tool in the other window, waits for
  its backend to exit, and opens the session again
- **THEN** a backend is started and its page is loaded

#### Scenario: Backend exits during startup

- **WHEN** the TriggerFlow backend process exits 2 seconds after starting, before its
  server answers
- **THEN** the panel shows "TriggerFlow® stopped before it was ready" without waiting the
  rest of the 10 seconds
