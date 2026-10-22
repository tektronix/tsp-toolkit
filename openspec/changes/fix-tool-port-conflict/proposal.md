# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
fixed ports are shared across windows. Script generation always uses port 27950 and
TriggerFlow always uses 27951. A second VS Code window starts its own backend, which
cannot bind the port, but the readiness check succeeds against the first window's server.
The second window's panel therefore shows the first window's backend, while session data
and workspace paths go to its own backend's stdin. The user can then edit one window's
session from another window, and the generated script lands in the wrong workspace.

## What Changes

- Before starting a tool's backend, when the extension holds no running process for that
  tool, the extension checks whether something already listens on the tool's port. If
  something does, it does not start the backend and does not load the page served on that
  port. The panel shows an error, and an error message says that the port is in use,
  probably by the same tool in another VS Code window, and that the user should close the
  tool there and try again. The session is not marked active and no messages are sent.
- If the extension's own backend process exits before its server is ready, the panel shows
  a startup error at once, instead of waiting out the 10-second readiness check or loading
  whatever else answers on the port.
- The ports stay fixed. Giving each window its own port needs the backends to accept a
  port, which they don't today. That is a follow-up for the `@tektronix/script-gen-*` and
  `@tektronix/trigger-flow-*` packages.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-backends`: "Tool backends" starts a backend only when nothing else listens on the
  tool's port, and "Opening a tool panel" reports a port in use and a backend that exits
  before its server is ready.

## Impact

- Code: `src/baseSessionManager.ts` (`spawnChildProcess()`, `openPanel()`,
  `checkServerReady()`), and the callers that start the backend in
  `src/scriptGenWebViewManager.ts` and `src/triggerFlowWebViewManager.ts`
  (`handleViewCommand()` and `createNewSession()`).
- Only one window at a time can use each tool. The first window to start a tool keeps it
  until its panel is closed and its backend exits. This is the same limit as today, but
  stated instead of silently mixing windows.
- `fix-tool-panel-load-failure` also modifies "Opening a tool panel". Whichever of the two
  is archived second must re-apply its edits onto the text left by the first.
- `tool-backends` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
