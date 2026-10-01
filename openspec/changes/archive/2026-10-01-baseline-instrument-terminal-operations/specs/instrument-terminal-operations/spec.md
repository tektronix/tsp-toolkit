# Spec Delta

## Purpose

Describes what the extension does to an instrument once it has a connection: the
instrument terminal (REPL) and its command line, how commands pick the connection they
act on, the terminal dot commands behind each operation, and the one-shot background
`kic` processes used when no terminal is open. This is a baseline of current behavior,
including known quirks.

## ADDED Requirements

### Requirement: Instrument terminal command line

An instrument terminal SHALL run the `kic` executable with the arguments
`--log-file <log dir>/<YYYY-MM-DD>-kic.log connect <address>`, where the date is the
current UTC date. The arguments SHALL also include `--keyring <id>` when the connection
holds a credential keyring id from a login, `--reset` when `tsp.reset` is `true`, and
`--clear-error-queue` when `tsp.clearErrorQueue` is `true`. The terminal SHALL be named
after the instrument, use the TSP terminal icon, be transient (VS Code does not restore it
after a restart), and be shown and focused when it opens.

#### Scenario: Default terminal

- **WHEN** a terminal is opened to `192.168.0.5` with `tsp.reset` and
  `tsp.clearErrorQueue` both `false` and no login was needed
- **THEN** the terminal runs `kic --log-file <log dir>/<date>-kic.log connect 192.168.0.5`
  with no other arguments

#### Scenario: Password-protected instrument

- **WHEN** the connect flow logged in and received a keyring id
- **THEN** the terminal command line includes `--keyring <id>`

#### Scenario: Not restored after restart

- **WHEN** VS Code restarts while an instrument terminal is open
- **THEN** that terminal is not recreated

### Requirement: Recognizing toolkit terminals

The extension SHALL treat a terminal as an instrument terminal only when it was launched
with the `kic` executable as its shell. A command that acts on "the active terminal" SHALL
use the connection whose terminal has the same process id as the active terminal. The
extension's API SHALL list all instrument terminals and, given a terminal's process id,
SHALL return that connection's terminal name, address, and connection type.

#### Scenario: Active terminal is not an instrument terminal

- **WHEN** a command that targets the active terminal runs while the active terminal is a
  regular shell
- **THEN** it does not use that terminal

#### Scenario: API lookup by process id

- **WHEN** an API caller passes the process id of an open instrument terminal
- **THEN** it receives that terminal's name, the connection's address, and its connection
  type

### Requirement: Choosing the target connection

Send Script to Terminal, Save TSP Script Output, and Fetch connected instrument and its
TSP-Link nodes SHALL act on the connection behind the active instrument terminal when
there is one. Otherwise they SHALL show the Connect quick pick, and use the selected or
typed connection if it connects successfully. If the user dismisses the quick pick, or the
connection fails, the command SHALL do nothing more. Instrument-level operations (start
saving TSP output, save buffers, update firmware, stop saving TSP output) SHALL use the
instrument's `Connected` connection. When none is connected, every one except stop saving
SHALL ask "Which connection?" with a quick pick of the instrument's connection addresses.
Stop saving TSP output SHALL instead send nothing.

#### Scenario: Send script with an instrument terminal focused

- **WHEN** the active terminal is an instrument terminal and the user runs Send Script to
  Terminal
- **THEN** the script is sent to that terminal and no picker is shown

#### Scenario: Send script with no instrument terminal focused

- **WHEN** the active terminal is not an instrument terminal and the user runs Send Script
  to Terminal
- **THEN** the Connect quick pick is shown, and the script is sent after the selected
  connection connects

#### Scenario: Picker dismissed

- **WHEN** the Connect quick pick is dismissed
- **THEN** nothing is sent and no error is shown

### Requirement: Sending a script

Send Script to Terminal SHALL send `.script "<file path>"` to the target terminal and
bring the terminal to the front. When the command is run without a file (for example from
the Command Palette), it SHALL use the active editor's file if that file ends in `.tsp` or
`.tspa`. Otherwise it SHALL show the error "No file selected. Please open a TSP file.". The
command SHALL be offered in the editor title Run menu, the editor and editor-tab context
menus, and the Explorer context menu for `.tsp` and `.tspa` files.

#### Scenario: Run from the editor title

- **WHEN** the user runs Send Script to Terminal from the Run menu of `test.tsp` while an
  instrument terminal is active
- **THEN** `.script "<path>/test.tsp"` is sent to that terminal and the terminal is shown

#### Scenario: Command Palette with a non-TSP file open

- **WHEN** the user runs Send Script to Terminal from the Command Palette while a `.py`
  file is the active editor
- **THEN** the error "No file selected. Please open a TSP file." is shown and nothing is
  sent

### Requirement: Saving script output

Save TSP Script Output SHALL take a `.tsp` or `.tspa` file, ask for an output file with a
save dialog titled "Select Output File", and send `.save --script "<script>" --output
"<output>"` to the target terminal, connecting first if the connection has no terminal. If
the user cancels the save dialog, nothing SHALL be sent. The command SHALL be offered in
the editor title Run menu for `.tsp` and `.tspa` files.

#### Scenario: Save script output

- **WHEN** the user runs Save TSP Script Output on `test.tsp` and picks `out.txt`
- **THEN** `.save --script "<path>/test.tsp" --output "<path>/out.txt"` is sent to the
  target terminal

#### Scenario: Save dialog cancelled

- **WHEN** the user cancels the "Select Output File" dialog
- **THEN** nothing is sent

### Requirement: Capturing TSP output

Start saving TSP output SHALL mark the instrument as `Saving`, ask for an output file with
a save dialog titled "Select Output File", and send `.save --tsp --output "<output>"`,
connecting first if needed. If the user cancels the save dialog, the `Saving` mark SHALL
be cleared and nothing sent. Stop saving TSP output SHALL clear the `Saving` mark and send
`.save --end` to the connected terminal, and send nothing if there is no terminal. Starting
a new connection attempt SHALL clear the `Saving` mark (see
`instrument-connection-lifecycle`).

#### Scenario: Start and stop capture

- **WHEN** the user starts saving TSP output to `log.txt` on a connected instrument and
  later stops it
- **THEN** `.save --tsp --output "<path>/log.txt"` is sent, the instrument is marked
  `Saving`, then `.save --end` is sent and the mark is cleared

#### Scenario: Output file not chosen

- **WHEN** the user starts saving TSP output and cancels the save dialog
- **THEN** no command is sent and the instrument is not marked `Saving`

### Requirement: Saving buffers to a file

Save buffers to a file SHALL prompt in this order: buffer variable names (comma-separated,
each trimmed), a delimiter (Escape falls back to `,`), at least one field to print from
`absolute_timestamps`, `relative_timestamps`, `readings`, `measurefunctions`,
`measureranges`, `sourcefunctions`, `sourceoutputstates`, `sourceranges`, `sourcevalues`,
and `statuses`, and an output file. It SHALL then send `.save --buffer "<b1>" --buffer
"<b2>" … --format "<field1>,<field2>,…" --delimiter "<delimiter>" --output "<output>"`,
connecting first if needed. Dismissing the buffer prompt, selecting no fields, or
cancelling the output dialog SHALL end the flow without sending anything.

#### Scenario: Two buffers, two fields

- **WHEN** the user enters `defbuffer1, buf2`, accepts the default delimiter by pressing
  Escape, picks `readings` and `relative_timestamps`, and chooses `data.csv`
- **THEN** `.save --buffer "defbuffer1" --buffer "buf2" --format
  "readings,relative_timestamps" --delimiter "," --output "<path>/data.csv"` is sent

#### Scenario: No fields selected

- **WHEN** the user accepts the fields prompt with nothing selected
- **THEN** nothing is sent

### Requirement: Updating firmware

Update firmware SHALL ask for a firmware file (`.x` or `.upg`) with an open dialog labeled
"Update". For a Versatest instrument it SHALL first ask "What do you want to update?" and
offer "Mainframe" plus "Slot 1" to "Slot 3" for the MP5103 and TSPop, or only "Mainframe"
for other Versatest models. Non-Versatest instruments SHALL get no slot prompt. If the
selected file is empty, it SHALL show "Firmware file is empty (0 bytes)" and send nothing.
Otherwise it SHALL show "Starting update on <name>@<address>" (with ", slot <n>" when a
slot was chosen) and send `.update "<file>"`, or `.update --slot <n> "<file>"` for a slot,
connecting first if the connection has no terminal. Update firmware SHALL NOT appear in the
Command Palette.

#### Scenario: Regular instrument update

- **WHEN** the user updates a connected 2450 with `fw.upg`
- **THEN** no slot prompt is shown, "Starting update on <name>@<address>" is shown, and
  `.update "<path>/fw.upg"` is sent

#### Scenario: MP5103 slot update

- **WHEN** the user updates an MP5103, chooses "Slot 2", and picks `fw.x`
- **THEN** `.update --slot 2 "<path>/fw.x"` is sent

#### Scenario: Empty firmware file

- **WHEN** the selected firmware file is 0 bytes
- **THEN** "Firmware file is empty (0 bytes)" is shown and nothing is sent

### Requirement: Reset and abort

Reset and Abort SHALL act on the connection they are invoked on. When the connection has
an open terminal, they SHALL bring the terminal to the front and send `.reset` or `.abort`.
When it has no terminal, they SHALL run a one-shot `kic reset <address>` or
`kic abort <lan|visa> <address>` process and wait for it to exit. When the command
finishes, "Reset complete" or "Abort complete" SHALL be shown. For a terminal this happens
as soon as the dot command is sent, and for a one-shot process when the process exits,
whatever its exit code.

#### Scenario: Reset with a terminal open

- **WHEN** the user resets a `Connected` connection
- **THEN** `.reset` is sent to its terminal, the terminal is shown, and "Reset complete"
  is shown right away

#### Scenario: Reset without a terminal

- **WHEN** the user resets an `Active` connection with no terminal
- **THEN** `kic reset <address>` runs in the background and "Reset complete" is shown
  after it exits

#### Scenario: Abort over VISA without a terminal

- **WHEN** abort runs on a VISA connection that has no terminal
- **THEN** `kic abort visa <address>` runs in the background

### Requirement: Fetching TSP-Link nodes

Fetch connected instrument and its TSP-Link nodes SHALL require an open workspace folder.
Without one, it SHALL show an information message and do nothing. Otherwise it SHALL bring
the target terminal to the front and send `.nodes "<first workspace folder>/.vscode/settings.json"`.
It SHALL be offered in the System Configurations view title and SHALL NOT appear in the
Command Palette.

#### Scenario: No workspace open

- **WHEN** the user runs the command with no folder open
- **THEN** an information message is shown and nothing is sent

#### Scenario: Workspace open

- **WHEN** the user runs the command with an instrument terminal active and a workspace
  folder open
- **THEN** `.nodes "<folder>/.vscode/settings.json"` is sent to that terminal

### Requirement: Leaving the terminal for debugging

Before a debug session starts on a connection, the extension SHALL send `.exit` to that
connection's terminal, if it has one, and SHALL wait until the terminal has closed. Because
the terminal's process exits by itself, no reset is sent (see Terminal close in
`instrument-connection-lifecycle`). After debugging, the extension API SHALL reconnect the
same connection using the terminal name it had before.

#### Scenario: Debug while connected

- **WHEN** the user starts debugging a TSP file on a `Connected` connection
- **THEN** `.exit` is sent, the debugger starts only after the terminal closes, and the
  instrument is not reset

### Requirement: One-shot background processes

Every one-shot `kic` process SHALL be started with
`--log-file <log dir>/<YYYY-MM-DD>-kic.log` before its subcommand. The `check-login`,
`login`, and `ping` processes SHALL run with `CLICOLOR=1` and `CLICOLOR_FORCE=1` set. A
connection SHALL track at most one background process. Reset and Abort without a terminal
SHALL wait for that process to exit before starting their own. When a one-shot process is
stopped (connection cancelled, timed out, or disposed), the extension SHALL kill the
process tree forcibly on Windows and send `SIGINT` on other platforms. Disposing a
connection SHALL also dispose its terminal.

#### Scenario: Reset while a probe is running

- **WHEN** reset is requested for a connection with no terminal while a `ping` for it is
  still running
- **THEN** `kic reset` starts only after the `ping` process exits

#### Scenario: Cancelled on Windows

- **WHEN** a connection attempt is cancelled on Windows while `check-login` is running
- **THEN** that process and its children are force-terminated

### Requirement: Login and identity probes

`kic check-login <address>` SHALL decide whether credentials are needed from its exit
code. Exit code `2` SHALL mean the instrument is in use. Exit code `3` or `4` SHALL mean it
is protected: a password is always required, a username is required when the output
contains `USERNAME`, and a stored keyring id is taken from the last comma-separated item
after the first `": "` when the output lists one. Any other exit code SHALL mean no login
is needed. Login SHALL run `kic login <address>` with `--keyring <id>` when a keyring id is
known. Otherwise it SHALL pass `--username <name>` (only if the name is not blank) and
`--password <password>`. If neither a username nor a password was entered, no process SHALL
run and the attempt SHALL count as failed. The trimmed output of `kic login` SHALL be the
keyring id, and empty output SHALL mean the login failed. Identity SHALL come from
`kic ping --json <address>` (with `--keyring <id>` when known). Its output SHALL be used
only when the process exits with code `0`, and SHALL be parsed as JSON instrument
information.

#### Scenario: Username and password required

- **WHEN** `check-login` exits with code `3` and its output contains `USERNAME`
- **THEN** the user is asked for a username and a password

#### Scenario: Stored credentials

- **WHEN** `check-login` exits with code `4` and its output names a keyring id
- **THEN** no credentials are prompted for and `kic login <address> --keyring <id>` is run

#### Scenario: Ping fails

- **WHEN** `kic ping --json` exits with a non-zero code
- **THEN** no instrument information is returned, even if it printed output
