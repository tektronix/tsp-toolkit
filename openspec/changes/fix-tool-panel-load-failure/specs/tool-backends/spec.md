# Spec Delta

## MODIFIED Requirements

### Requirement: Opening a tool panel

Opening a tool's panel when it already exists SHALL reveal it. Otherwise the extension
SHALL create the panel in the first editor column with scripts enabled and its content
kept while hidden, start watching for the panel to close, and then request
`http://127.0.0.1:<port>` every 500 ms until a request succeeds or 10 seconds have passed.
On success it SHALL load the HTML returned by the server into the panel, and only then
SHALL it start handling messages from the panel and sending theme refresh signals. If the
panel is closed before the HTML is loaded, the extension SHALL stop and SHALL NOT load
anything or start handling messages. If the server does not answer in time or the HTML
cannot be loaded, the panel SHALL show "Error starting server or loading content". If the
backend cannot be started, the panel, when open, SHALL show "Error starting <tool>
executable", where `<tool>` is "I-V Characterization" or "Trigger Flow".

#### Scenario: Server ready

- **WHEN** the user creates a TriggerFlow session and the backend's server answers within
  10 seconds
- **THEN** a "TriggerFlow®" panel opens showing the page served on port 27951

#### Scenario: Server never answers

- **WHEN** the script generation server does not answer within 10 seconds
- **THEN** the panel shows "Error starting server or loading content"

#### Scenario: Panel closed while waiting

- **WHEN** the user closes the TriggerFlow panel 3 seconds after it opened, before the
  server answers
- **THEN** the extension stops waiting and the closed panel is not loaded

### Requirement: Closing the panel and deactivating

When a tool's panel closes, whether or not its page loaded, the extension SHALL forget the
panel, send `{"shutdown": true}` to the backend if a process exists, and clear the tool's
active session. It SHALL NOT kill the process. The next request to open the tool SHALL
create a new panel. When the extension is deactivated it SHALL kill both backend
processes.

#### Scenario: Panel closed

- **WHEN** the user closes the TriggerFlow panel while `burst` is active
- **THEN** the TriggerFlow backend receives `{"shutdown": true}` and `burst` is no longer
  marked active

#### Scenario: Reopen after closing

- **WHEN** the user closes the script generation panel and then opens a session
- **THEN** a new panel is created and loaded as when opening it for the first time

#### Scenario: Close a panel that failed to load

- **WHEN** the script generation panel shows "Error starting server or loading content"
  for the session `sweep` and the user closes it
- **THEN** the backend, if its process exists, receives `{"shutdown": true}`, and `sweep`
  is no longer marked active

#### Scenario: Retry after a failed load

- **WHEN** the user closes a script generation panel that failed to load and opens the
  session again
- **THEN** a new panel is created and the extension waits for the server again
