# Design

## Context

`Connection.getNodes(folder)` shows the connection's terminal and sends
`.nodes "<folder>/.vscode/settings.json"`. kic-cli, running in that terminal, connects to
the instrument, reads the TSP-Link node and slot layout, and writes a
`tsp.tspLinkSystemConfigurations` entry with an empty name into that JSON file. The
command runs inside the terminal process, so the extension gets no completion signal.
Today the extension relies on VS Code noticing the settings file change, which then fires
`onDidChangeConfiguration` and starts the naming flow in `ConfigWebView`.

## Goals / Non-Goals

**Goals:**

- Fetching works the same in single-folder and multi-root workspaces.
- The fetched entry is written through the settings API to the same target as every
  other write to the setting.

**Non-Goals:**

- Changing the kic-cli `.nodes` command or its output format.
- Changing how the unnamed entry is validated and named. That flow already triggers on
  the setting change.

## Decisions

### Hand kic-cli a temporary file

Create a unique file, for example `tsp-nodes-<random>.json` under `COMMON_PATHS.temp` from
`src/utility.ts`, and send `.nodes "<that file>"`. The extension owns the file, so nothing
else in the workspace is touched. Whether it starts as an empty JSON object (`{}`) or does
not exist yet depends on what `.nodes` accepts. Task 1.1 checks this before the
implementation starts. Either way, the reading logic is the same.

Alternatives considered:

- **Point `.nodes` at the `.code-workspace` file.** Its settings sit under a `settings`
  key, so kic-cli would write the entry at the wrong level. It would also need a backend
  change.
- **Keep writing the first folder's file, then copy the entry to the workspace target.**
  This leaves a stray folder-level entry behind in a multi-root workspace, and in a
  single-folder workspace it would trigger the naming flow twice.
- **Block fetching in multi-root workspaces.** This was considered and rejected in favor
  of making it work.

### Wait by polling, with a timeout

After sending the command, poll the file every 500 ms for up to 30 seconds. On each
poll, read and `JSON.parse` the file. While it is missing, unparsable (possibly a partial
write), or has no entry with an empty name under `tsp.tspLinkSystemConfigurations`, keep
waiting. Once it has one, stop polling, append every entry with an empty name to the
current setting value, write the result with the workspace target, and delete the file.
On timeout, delete the file and show a warning.

Polling the extension's own file is simpler and more predictable than a
`FileSystemWatcher` on a path outside the workspace, and it works the same on every
platform. Thirty seconds covers large TSP-Link systems, whose fetch kic-cli has needed
fixes for before (see the 1.5.2 changelog), and is short enough not to leave work hanging
if the instrument never answers.

### Reuse the existing naming flow

Appending the unnamed entry with `update(..., false)` fires `onDidChangeConfiguration`,
which already validates the entry, prompts for a name, and activates it. No other code
path changes. The append reads the current value right before writing, so a system the
user adds by hand during the wait isn't lost.

## Risks / Trade-offs

- [kic-cli might later change how `.nodes` writes the file] → This dependency on the
  format exists today too. The parser only reads the one key, so other content in the
  file is ignored.
- [The user starts a second fetch before the first finishes] → Each fetch uses its own
  file and poller, so both entries arrive. The naming flow handles one unnamed entry at a
  time, as it does today when two entries show up together.
- [The terminal command fails, for example because the instrument rejects it] → The
  timeout warning tells the user that nothing arrived, and the terminal shows kic-cli's
  own error.
