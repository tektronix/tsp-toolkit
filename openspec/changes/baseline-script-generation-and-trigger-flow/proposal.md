# Proposal

## Why

I-V Characterization script generation and TriggerFlow® are the two graphical tools in
the Tools view. Today their rules exist only in `baseSessionManager.ts`, its two
subclasses, `genericSessionStorage.ts`, and the session tree providers. Most of the
behavior is shared through `BaseSessionManager`, but the two tools differ in small ways
that matter, such as when a saved session is sent to the backend and whether an update to
an unknown session creates it. This change records the **current** behavior as a baseline
so later fixes can be written as deltas against it.

## What Changes

- Add a baseline spec for tool sessions as they behave today, quirks included: where
  sessions are stored, how the Tools view shows them, how sessions are named, created,
  deleted, and reset, and how the legacy `tsp.script_generation` setting is migrated. For
  example, a session name is checked after trimming but saved as typed.
- Add a baseline spec for the tool backends and their panels as they behave today, quirks
  included: starting the backend process, opening one panel per tool, the messages the
  extension sends the backend and the webview messages it handles, and what happens when
  the panel closes. For example, the panel is loaded from whichever server answers on the
  tool's fixed port.
- No code or behavior changes.

### Out of scope

- What the backends do with the messages they receive, what the generated scripts
  contain, and the webview UI itself. These are decided by the `@tektronix/script-gen-*`
  and `@tektronix/trigger-flow-*` packages. The specs describe only the extension's side.
- The TSP-Link system list and how it is edited, which is already
  `tsp-link-system-configurations`. These specs describe only what the tools do with it.
- The help-document panel that "open manual" requests are routed to
  (`helpDocumentWebView.ts`). This is left for a later baseline.
- The "Other TSP Toolkit Preferences" option of Reset to Defaults, apart from the fact
  that it leaves session settings alone.

### Known deviations (not specified)

These are recorded here and deliberately left out of the specs, so the baseline does not
lock them in:

- **Fixed ports are shared across windows.** Script generation always uses port 27950 and
  TriggerFlow always uses 27951. A second VS Code window starts its own backend, which
  cannot bind the port, but the readiness check succeeds against the first window's
  server. The second window's panel therefore shows the first window's backend, while
  session data and workspace paths go to its own backend's stdin. (Inferred from the
  code, not reproduced.)
- **Session names are not trimmed when saved.** The name prompt rejects empty, too long,
  badly formed, or duplicate names after trimming, but keeps the name as typed. Leading
  and trailing spaces become part of the stored name and of the generated script's file
  name.
- **Session writes are not serialized.** Adding, updating, and removing a session each
  read the setting, change it, and start a write without waiting for earlier writes. If
  the backend reports a new session and then an update before the first write lands, the
  update cannot find the session. Script generation then drops the update. TriggerFlow
  treats it as a new session and adds a second entry with the same name. (Read from the
  code, not reproduced.)
- **A failed panel load blocks the tool until reload.** When the server does not answer
  or its page cannot be loaded, the panel shows an error, but the extension never starts
  watching for that panel to close. Closing it sends no shutdown, leaves the session
  marked active, and leaves the closed panel recorded as open. Later attempts to open
  that tool try to reveal the closed panel instead of creating a new one, so the tool
  stays unusable until the window is reloaded. (Read from the code, not reproduced.)
- **Legacy sessions can be discarded.** If the legacy `tsp.script_generation` setting
  holds sessions for a tool whose new setting already holds sessions, the legacy
  sessions are not migrated. The legacy setting is still removed, so they are lost.
- **Theme listeners pile up.** Each time a tool's panel is opened, a new color-theme
  listener is registered and never removed. After the panel has been closed and reopened
  `n` times, one theme change sends `n + 1` refresh signals to the backend.
- **Open Script failures are not reported.** The error handler around opening the
  generated script cannot catch the asynchronous failure, so a missing script file
  produces no message.
- **Manual links assume one module.** Every "open manual" request opens a page under
  `MSMU60-2/`, whatever instrument the session uses. A block name that is not in the
  built-in map opens `MSMU60-2/undefined`.
- **Sessions from other scopes are copied into the workspace.** Sessions are read from the
  effective value of the setting, which VS Code merges across user, workspace, and folder
  settings, and every write goes to workspace settings. Sessions defined in user settings
  are therefore copied into the workspace on the first change. This is the same pattern
  as `fix-settings-scope-merge`, which covers only `workspaceManager.ts`.
- **Hand edits are not shown.** The Tools view refreshes only after the extension changes
  a session or the system list. Editing `tsp.scriptGenSessions` or
  `tsp.triggerFlowSessions` in `settings.json` is not shown until one of those happens.

## Capabilities

### New Capabilities

- `tool-sessions`: the `tsp.scriptGenSessions` and `tsp.triggerFlowSessions` settings and
  their entry format, the Tools view (open-folder requirement, the two tool nodes, session
  items and the active marker), the system-configuration requirement and the name prompt
  for a new session, saving and updating sessions reported by the backend, deleting one
  session or all sessions, the session options of Reset to Defaults, and migrating the
  legacy `tsp.script_generation` setting.
- `tool-backends`: the per-tool backend executables, ports, and panel titles, starting the
  backend process and waiting for its server, the single panel per tool, the messages
  sent to the backend (reset, session path, saved session data, system list, line
  frequency, theme refresh, shutdown) and when each is sent, the webview messages the
  extension handles (initial configuration, new and updated session, open script, open
  manual), how startup failures are shown, and what closing the panel and deactivating
  the extension do.

### Modified Capabilities

None. `tsp-link-system-configurations` already requires that open tool sessions receive
the updated system list. `tool-backends` describes that message in more detail without
changing the requirement.

## Impact

- Documentation only: on archive, adds `openspec/specs/tool-sessions/spec.md` and
  `openspec/specs/tool-backends/spec.md`.
- Describes behavior in `src/baseSessionManager.ts`, `src/scriptGenWebViewManager.ts`,
  `src/triggerFlowWebViewManager.ts`, `src/kic-script-gen-cli.ts`,
  `src/kic-script-trigger-flow-cli.ts`, `src/genericSessionStorage.ts`,
  `src/genericSessionDataProvider.ts`, `src/scriptGenDataProvider.ts`,
  `src/triggerFlowDataProvider.ts`, `src/combinedScriptGenDataProvider.ts`, and
  `src/extension.ts` (activation, deactivation, Reset to Defaults), plus the session
  commands, `view/item/context` and `commandPalette` menus, the `ToolsView` view, and the
  `tsp.scriptGenSessions`, `tsp.triggerFlowSessions`, `tsp.script_generation`, and
  `tsp.lineFrequency` settings in `package.json`.
- Tree item `contextValue` strings (`SavedIVCharTreeItem`, `SavedIVCharInstance`,
  `ActiveSavedIVCharInstance`, and the `TriggerFlow` equivalents) are matched by exact
  `when` clauses in `package.json`. The spec names the user-visible effect, not the
  strings.
- Not described because it has no effect: the `tsp.script_generation` schema names its
  TriggerFlow key `TriggerFlow`, while the stored and migrated key is `Trigger Flow`; the
  unused `treeview` field and `sessionExists()` override on the managers; and the
  `"No saved sessions found"` item that `getChildren()` returns for elements it does not
  own, which the combined provider never asks for.
