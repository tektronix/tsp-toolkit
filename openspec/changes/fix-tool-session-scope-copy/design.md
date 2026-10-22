# Design

## Context

`GenericSessionStorage.loadSessions()` returns
`getConfiguration().get<SessionCollection>("tsp.<key>") ?? {}`. For an object-valued
setting, `get()` merges the user and workspace values key by key, with the workspace
value winning for each key. In these settings each tool has a single key
(`I-V Characterization` or `Trigger Flow`), so a tool's sessions come entirely from the
workspace if the workspace value has that key, and otherwise entirely from user settings.
`addSession()`, `updateSession()`, `removeSession()`, and `removeAllSessions()` all change
the loaded object and write it back to workspace settings through `updateSettings()`. The
first write in a workspace without its own value therefore copies the user-level list.

Both settings are window-scoped, so folder-level values are ignored, and in a multi-root
workspace "workspace settings" means the `.code-workspace` file.

## Goals / Non-Goals

**Goals:**

- No write copies a session from user settings into workspace settings.
- What the Tools view lists is exactly what the extension writes.

**Non-Goals:**

- Removing sessions copied by earlier versions.
- Supporting sessions that are shared across workspaces. The generated script and the
  session path are tied to the first workspace folder, so such sessions never worked
  correctly anyway.
- Changing legacy migration (see the proposal).

## Decisions

### Read and write only the workspace value

`loadSessions()` returns
`getConfiguration().inspect<SessionCollection>("tsp.<key>")?.workspaceValue ?? {}`. It
returns a copy (for example a shallow clone of the object, with each tool's array copied),
so callers that push into or filter the result don't change the object VS Code returned.
`updateSettings()` keeps writing to workspace settings.

Alternatives considered:

- **Keep listing the effective value, but merge writes only with the workspace value**
  (the `fix-settings-scope-merge` approach). A session listed from user settings would
  appear in the Tools view, but saving it would still have to write it somewhere. Writing
  it to the workspace copies it, and writing it to user settings shares a workspace-bound
  session across workspaces. Neither is right, and the view would show sessions the
  storage can't consistently change.
- **Write to wherever the session came from.** This keeps user-level sessions working,
  but they still point at a script in whichever workspace is open, and add and remove
  would need per-session scope tracking. Rejected for the reasons above.

### No migration of user-level sessions

Sessions in user settings are only hidden, not moved or deleted. A user who wants one in
a workspace can copy it into that workspace's settings by hand. The changelog entry says
that user-level sessions are no longer shown.

## Risks / Trade-offs

- [Sessions disappear from the view] Anyone who added sessions to user settings by hand
  stops seeing them. → Called out in the changelog. The data isn't touched.
- [No folder open] `workspaceValue` is `undefined`, so the storage reads `{}`. The Tools
  view already shows only the "Open Folder" item in that case, and Reset to Defaults
  skips both session options.
