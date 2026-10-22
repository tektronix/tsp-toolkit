# Design

## Context

`BaseSessionManager.openPanel()` creates the panel, stores it in `this.panel`, waits up to
10 seconds for the server, and loads its HTML. Only after a successful load does it call
`setupWebviewMessageListener()`, `setupThemeChangeListener()`, and `setupPanelDisposal()`.
On failure it shows an error page and returns early. The disposal handler, which clears
`this.panel`, sends the shutdown message, and clears the active session, is therefore never
registered for a failed panel. `openPanel()` only creates a panel when `this.panel` is
unset, so later calls reveal the disposed panel.

## Goals / Non-Goals

**Goals:**

- Closing any tool panel resets the manager to "no panel", so the next open starts over.
- Closing a panel during the readiness wait does not leave work running against it.

**Non-Goals:**

- Killing or restarting a backend that is hung. The shutdown message is sent as today.
- Reporting the reason for the failure in more detail.
- Fixing the theme-listener leak, which is a separate deviation.

## Decisions

### Register disposal right after creation

Call `setupPanelDisposal()` immediately after `createWebviewPanel()` and
`setWebviewIcon()`, before `checkServerReady()`. The handler stays as it is: it clears
`this.panel`, sends the shutdown message if a process exists, and clears the active
session. The message listener and theme listener are still registered only after a
successful load, because a panel without the backend's page has nothing to send and
nothing to refresh.

Alternatives considered:

- **Register disposal in the error branch as well as after success.** This keeps two
  registration points in sync and still misses a panel closed during the wait.
- **Dispose the panel on failure.** The user would lose the error message, and the tool
  would look as though it never opened.

### Stop when the panel closes during the wait

Keep a local reference to the panel created by this call. After `checkServerReady()` and
after `loadWebviewContent()`, if `this.panel` no longer refers to that panel, return
without loading HTML, showing an error, or registering listeners. This avoids writing to a
disposed webview, which VS Code rejects, and avoids attaching listeners to a newer panel
created by a second open request.

## Risks / Trade-offs

- [The readiness wait keeps polling after the panel closes, until it succeeds or times
  out] → It only makes local HTTP requests and its result is ignored. Cancelling it would
  add an abort path for no visible benefit.
- [A shutdown message now reaches a backend whose server never came up] → This matches a
  normal close. The backend either exits or ignores it, and the next open reuses it or
  starts a new one, as today.
