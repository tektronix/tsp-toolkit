# Design

## Context

`BaseSessionManager.spawnChildProcess()` starts the backend whenever the manager holds no
live process. The backend binds a fixed port (27950 or 27951), which is compiled into the
Rust binaries; no command-line option to change it was found. `openPanel()` then polls
`http://127.0.0.1:<port>` until any server answers and loads its HTML. It never checks that
the server belongs to the process it just started. When the bind fails, the new process
exits, and the poll finds the server of another window.

The callers start the backend before opening the panel: `handleViewCommand()` and
`createNewSession()` in both subclasses call `spawnChildProcess()`, send messages, and then
`openPanel()`.

## Goals / Non-Goals

**Goals:**

- A window never loads a tool page that is served by a backend it did not start.
- The user is told why the tool did not open and what to do.
- A backend that dies during startup is reported at once.

**Non-Goals:**

- Running a tool in two windows at the same time. That needs a per-window port, which the
  backends would have to accept (for example as an argument or environment variable). It
  is a follow-up for the backend packages, after which the extension could pick a free
  port and drop this check.
- Detecting a conflict that starts after the backend is running. Once a window owns the
  port, no other window can bind it.

## Decisions

### Probe the port before spawning

Replace the callers' `spawnChildProcess()` with an async `startBackend(): Promise<boolean>`
on `BaseSessionManager`:

- If the manager holds a live process, return `true` without probing, as today.
- Otherwise open a TCP connection to `127.0.0.1:<port>` with `node:net` and a 1-second
  timeout. A successful connection means the port is in use: close the socket and return
  `false`. A refused connection or a timeout means it is free: spawn the backend and
  return `true`.

On `false`, the caller skips every stdin message and `setActiveStatus()`, and calls a new
`showPortInUse()` that creates or reveals the panel, sets its HTML to the port-in-use
text, shows the error message, and registers a disposal handler that only forgets the
panel. No message listener or theme listener is registered for that panel, because there
is no backend to talk to. The next open attempt runs the probe again.

Alternatives considered:

- **Probe over HTTP, as the readiness check does.** This would miss a non-HTTP program on
  the port, which would still make the backend fail to bind. A TCP connect catches any
  listener.
- **Try to bind the port from the extension and release it.** This races the backend for
  the port and can leave it in `TIME_WAIT` on some platforms. A connect has no side
  effects on the port.
- **Detect the conflict only after spawning, from the backend's exit or stderr.** The
  backend's exit can come after the readiness poll has already loaded the other window's
  page, and its stderr text is not a stable interface. The probe decides before anything
  is loaded. The exit check below still covers backends that die for other reasons.

### Stop waiting when the backend exits

`checkServerReady()` also resolves its loop when the manager's process emits `exit`, and
`openPanel()` shows "<title> stopped before it was ready" in that case. The process
reference is captured when the wait starts, so a later restart does not confuse it.

## Risks / Trade-offs

- [A port held by an unrelated program now blocks the tool, with a message that suggests
  another VS Code window] → The message says "probably", and the panel names the port, so
  the user can find the program.
- [The previous backend of the same window may still be exiting after its panel closed
  when the user reopens the tool] → The manager still holds that process until it exits,
  so no probe runs and nothing changes from today. If it has exited but the port is not yet
  released, the probe reports a conflict and a retry a moment later succeeds.
- [The probe adds up to 1 second when the port is free but the connection attempt hangs]
  → On loopback, a free port is refused immediately, so the timeout is only hit in unusual
  firewall setups.
