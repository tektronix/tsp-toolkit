# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation: a
failed panel load blocks the tool until reload. When the server does not answer in time
or its page cannot be loaded, the panel shows an error, but the extension only starts
watching for the panel to close after a successful load. Closing the error panel therefore
sends no shutdown to the backend, leaves the session marked active in the Tools view, and
leaves the closed panel recorded as open. Every later attempt to open that tool tries to
reveal the closed panel instead of creating a new one, so the tool stays unusable until the
window is reloaded.

## What Changes

- The extension watches for a tool's panel to close from the moment the panel is created,
  before it waits for the server.
- Closing a panel that failed to load behaves like closing any other panel: the panel is
  forgotten, the backend is sent the shutdown message if a process exists, and the session
  is no longer marked active.
- Opening the tool again after that creates a new panel and repeats the startup, so a
  slow or failed start can be retried without reloading the window.
- Closing the panel while the extension is still waiting for the server stops the load.
  Nothing is loaded into the closed panel.
- Message handling and theme refresh signals still start only after a successful load.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-backends`: "Opening a tool panel" watches for the panel to close from creation and
  stops loading if it closes early, and "Closing the panel and deactivating" applies to a
  panel that failed to load.

## Impact

- Code: `openPanel()` and `setupPanelDisposal()` in `src/baseSessionManager.ts`. The
  subclasses are not changed.
- The backend process is not killed when a failed panel closes, as today for any panel.
  If the process is still running, it gets the shutdown message. If it is hung, the next
  open reuses it and the readiness check fails again. Killing a hung backend is left out
  of scope.
- `fix-tool-port-conflict` also modifies "Opening a tool panel". Whichever of the two is
  archived second must re-apply its edits onto the text left by the first.
- `tool-backends` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
