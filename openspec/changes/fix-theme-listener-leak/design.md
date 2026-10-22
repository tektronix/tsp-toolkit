# Design

## Context

`BaseSessionManager.openPanel()` creates the tool's panel, waits for the backend's server,
loads its HTML, and then calls `setupWebviewMessageListener()`,
`setupThemeChangeListener()`, and `setupPanelDisposal()`. The message listener is
registered on the panel's webview, so it goes away with the panel. The theme listener is
registered on `vscode.window`, which outlives the panel, and its disposable is dropped.
The listener's body already checks `this.panel && this.child` before sending
`{"refresh":true,"reason":"theme-change"}`.

## Goals / Non-Goals

**Goals:**

- One theme listener per tool, however often the panel opens and closes.
- The listener is disposed when the extension deactivates.

**Non-Goals:**

- Changing the refresh message or when the backend acts on it.
- Changing the order of the other steps in `openPanel()`, which
  `fix-tool-panel-load-failure` handles.

## Decisions

### Register once in the constructor

Call `setupThemeChangeListener()` from the `BaseSessionManager` constructor, next to
`registerCommands()` and `listenToConfigChanges()`, push the returned disposable to
`this.context.subscriptions`, and remove the call from `openPanel()`. The existing
`this.panel && this.child` check keeps the listener silent while the tool has no panel or
no backend process.

Alternatives considered:

- **One listener per panel, disposed when the panel closes.** This also fixes the leak,
  but it ties the listener to the panel-disposal handler, which `openPanel()` only
  installs after a successful load today and which `fix-tool-panel-load-failure` moves.
  A panel that fails to load would also need its own cleanup path. Registering once
  avoids all of that and needs no new state.
- **Keep registering in `openPanel()` but guard with a flag.** This works, but it is
  the constructor registration with extra state.

## Risks / Trade-offs

- [The listener also fires while a panel is still loading, which it never did before]
  → The refresh signal is harmless before the page loads: the backend gets the current
  theme when it serves the page. If that turns out to matter, add `this.panel.visible`
  or a "loaded" flag to the existing check.
- [`listenToConfigChanges()` has the same pattern and is also not disposed] → It is
  registered once per manager, so it doesn't pile up. It is left alone here.
