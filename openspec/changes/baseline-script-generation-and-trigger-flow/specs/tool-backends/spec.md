# Spec Delta

## Purpose

Describes how the extension runs the backends of its two graphical tools,
I-V Characterization script generation and TriggerFlow®: which executable and port each
tool uses, how the backend process is started and its web server shown in a panel, which
messages the extension sends the backend and when, which messages from the panel it
handles, and what closing the panel and deactivating the extension do. What the backends
do with those messages is decided by the backend packages. This is a baseline of current
behavior, including known quirks.

## ADDED Requirements

### Requirement: Tool backends

Script generation SHALL use the `SCRIPT_GEN_EXECUTABLE` exported by
`@tektronix/script-gen-<platform>-<arch>`, port 27950, and the panel title "TSP Script
Generation". TriggerFlow SHALL use the `TRIGGER_FLOW_EXECUTABLE` exported by
`@tektronix/trigger-flow-<platform>-<arch>`, port 27951, and the panel title
"TriggerFlow®". Each tool SHALL have at most one backend process and at most one panel per
window. A backend SHALL be started, with no arguments, only when that tool has no process
yet or its process has exited or been killed. Every message to a backend SHALL be one line
of text written to its stdin, and SHALL be sent only while the extension holds a process
for that tool. The backend's stdout and stderr SHALL only be logged to the console.

#### Scenario: Backend already running

- **WHEN** the script generation backend is running and the user opens another script
  generation session
- **THEN** no second backend process is started

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
Flow".

#### Scenario: Server ready

- **WHEN** the user creates a TriggerFlow session and the backend's server answers within
  10 seconds
- **THEN** a "TriggerFlow®" panel opens showing the page served on port 27951

#### Scenario: Server never answers

- **WHEN** the script generation server does not answer within 10 seconds
- **THEN** the panel shows "Error starting server or loading content"

### Requirement: Starting a new session

When the user creates a session as described in `tool-sessions`, the extension SHALL set
the tool's current session name, start the backend if needed, send `{"reset":true}`, open
the panel, and mark the session active. Script generation SHALL send the reset before
opening the panel. TriggerFlow SHALL send it after the panel has opened or failed to open.
A new TriggerFlow session SHALL NOT receive saved session data.

#### Scenario: New script generation session

- **WHEN** the user creates the script generation session `sweep`
- **THEN** the backend receives `{"reset":true}`, the panel opens, and `sweep` is marked
  active

### Requirement: Opening a saved session

Clicking a saved session SHALL make it the tool's current session. If it differs from the
session whose path was last sent, the extension SHALL send
`{"session":"<name>","folder":"<first workspace folder>"}`. For script generation the
extension SHALL then start the backend if needed and send the session's stored
configuration string as is. For TriggerFlow the extension SHALL start the backend if it is
not running, or send `{"reset":true}` if it is, and SHALL send the stored configuration
later, in reply to the panel's request for its initial configuration. In both tools the
extension SHALL then open the panel and mark the session active.

#### Scenario: Recall a script generation session

- **WHEN** the script generation backend is running for `pulse` and the user clicks the
  saved session `sweep`
- **THEN** the backend receives the session path for `sweep` and then `sweep`'s stored
  configuration, the panel is revealed, and `sweep` is marked active

#### Scenario: Recall a TriggerFlow session while running

- **WHEN** the TriggerFlow backend is running and the user clicks the saved session `burst`
- **THEN** the backend receives `{"reset":true}`, and `burst`'s stored configuration is
  sent when the panel next asks for its initial configuration

### Requirement: Initial configuration

When the panel asks for its initial configuration, the extension SHALL send the session
path for the current session name, or for `default_session` when no name is set, and
record it as the last sent path. For a TriggerFlow session opened from the Tools view it
SHALL then send that session's stored configuration, if one is saved. It SHALL then send
the system configuration as described in "System configuration updates".

#### Scenario: Initial configuration for a recalled TriggerFlow session

- **WHEN** the TriggerFlow panel for the saved session `burst` asks for its initial
  configuration
- **THEN** the backend receives the session path for `burst`, then `burst`'s stored
  configuration, then `{"systems":[...]}`

### Requirement: System configuration updates

Sending the system configuration SHALL send `{"systems":[...]}` with the current value of
`tsp.tspLinkSystemConfigurations`. For script generation it SHALL first send
`{"lineFrequency":<value>}` with the value of `tsp.lineFrequency`, or 60 when that value
is not a finite number greater than 0 and at most 120. TriggerFlow SHALL NOT receive the
line frequency. The extension SHALL send the system configuration whenever
`tsp.tspLinkSystemConfigurations` changes, and for script generation also whenever
`tsp.lineFrequency` changes.

#### Scenario: Line frequency changed

- **WHEN** the script generation backend is running and the user sets `tsp.lineFrequency`
  to 50
- **THEN** the backend receives `{"lineFrequency":50}` followed by the system list, and the
  TriggerFlow backend receives nothing

#### Scenario: System list changed

- **WHEN** both backends are running and the user adds a TSP-Link system
- **THEN** each backend receives `{"systems":[...]}` with the updated list

### Requirement: Theme changes

When the active color theme changes while a tool's panel is open and its backend process
exists, the extension SHALL send `{"refresh":true,"reason":"theme-change"}` to that
backend.

#### Scenario: Theme switched

- **WHEN** the script generation panel is open and the user switches to a light theme
- **THEN** the script generation backend receives the theme refresh signal

### Requirement: Opening the generated script

When the panel asks to open the script, the extension SHALL open
`<first workspace folder>/<session name>.tsp` in the editor column beside the panel,
unless that file is already shown in a visible editor. With no folder open it SHALL show
the error "No workspace folder found". With no current session name it SHALL show the
error "No session name found".

#### Scenario: Open script

- **WHEN** the panel for `sweep` asks to open the script and `sweep.tsp` is not visible
- **THEN** `sweep.tsp` from the first workspace folder opens beside the panel

#### Scenario: Script already visible

- **WHEN** `sweep.tsp` is already shown in a visible editor
- **THEN** nothing new is opened

### Requirement: Opening the manual for a block

When the panel asks to open the manual with a payload naming a `block_name`, as a JSON
string or an object, the extension SHALL open the help document
`MSMU60-2/<page>` beside the panel with the block name as its title, where `<page>` comes
from a fixed map of trigger model block names to help pages. A payload without a
`block_name`, or one that is not valid JSON, SHALL only be logged.

#### Scenario: Known block

- **WHEN** the panel asks to open the manual for the block `MEASURE`
- **THEN** the help document `MSMU60-2/114968.htm` opens beside the panel titled
  `MEASURE`

### Requirement: Unhandled panel messages

A message from the panel with an unknown command SHALL only be logged. While all sessions
of a tool are being deleted, every message from that tool's panel SHALL be ignored.

#### Scenario: Unknown command

- **WHEN** the panel sends a command the extension does not know
- **THEN** a warning is logged and nothing else happens

### Requirement: Closing the panel and deactivating

When a tool's panel closes, the extension SHALL forget the panel, send
`{"shutdown": true}` to the backend if a process exists, and clear the tool's active
session. It SHALL NOT kill the process. When the extension is deactivated it SHALL kill
both backend processes.

#### Scenario: Panel closed

- **WHEN** the user closes the TriggerFlow panel while `burst` is active
- **THEN** the TriggerFlow backend receives `{"shutdown": true}` and `burst` is no longer
  marked active

#### Scenario: Reopen after closing

- **WHEN** the user closes the script generation panel and then opens a session
- **THEN** a new panel is created and loaded as when opening it for the first time
