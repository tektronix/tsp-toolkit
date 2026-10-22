# Design

## Context

`GenericSessionStorage` (`src/genericSessionStorage.ts`) stores one tool's sessions in one
object-valued setting (`tsp.scriptGenSessions` or `tsp.triggerFlowSessions`). Each
mutating method calls `loadSessions()`, changes the returned object, and calls
`updateSettings()`, which starts `WorkspaceConfiguration.update()`. `addSession()` and
`removeSession()` don't wait for that promise, and `updateSession()` only attaches a
`catch`. The managers make their decisions before calling storage:
`ScriptGenWebViewManager.saveSession()` and `TriggerFlowWebViewManager.updateSession()`
call `storage.sessionExists()`, which reads the setting as it is at that moment, and then
call the matching storage method. Several storage instances exist for the same key: one
in each manager, one in each tree provider created in `activate()`, and short-lived ones
in the Reset to Defaults previews.

## Goals / Non-Goals

**Goals:**

- Changes to one session setting never interleave, within a window.
- Decisions that depend on stored sessions see every earlier change.
- The Tools view shows the result of a change, not the state before it.

**Non-Goals:**

- Coordinating between windows. Each window has its own extension host, and the
  workspace settings file is shared only when two windows open the same workspace.
- Changing which scope is read or written. That is `fix-tool-session-scope-copy`.
- Changing the order in which the backend sends its messages.

## Decisions

### A shared serial queue per settings key

Add a small helper in its own file that doesn't import `vscode`, for example
`createSerialQueue()` returning `enqueue<T>(op: () => Promise<T>): Promise<T>`. Each
operation starts only after the previous one has settled, whether it resolved or
rejected, and the returned promise settles with the operation's own result. Plain mocha
can test it.

`GenericSessionStorage` keeps a static `Map<string, SerialQueue>` keyed by settings key,
so every instance for `scriptGenSessions` shares one queue. Every mutating method becomes
`async`, wraps its whole read-change-write in `enqueue()`, and awaits the write inside
the operation. A rejected write is logged with `Log.error` and rethrown to the caller,
and the next operation still runs.

Alternatives considered:

- **A queue per instance.** The managers and tree providers hold different instances for
  the same key, so writes would still interleave.
- **Debouncing writes.** It reduces the number of writes, but a read during the debounce
  window still sees stale data, and it delays saving.
- **Keeping an in-memory copy as the source of truth.** It avoids reads, but hand edits
  to `settings.json` and the legacy migration would then be overwritten by the cached
  copy.

### Decisions move inside the queued operation

Add `upsertSession(name, config): Promise<"added" | "updated">` to the storage. Inside
its queued operation it replaces the config of the first session with that name, or
appends a new entry if there is none. `addSession()` delegates to it, so an add is
idempotent. `updateSession(name, config): Promise<boolean>` replaces the config if the
session exists when the operation runs and reports whether it did.

The managers stop calling `sessionExists()` before writing:

- A reported new session (`saveSession()`, both tools) calls `upsertSession()`. When the
  result is `"added"`, the manager calls `dataProvider.addTreeItem(name)`, which refreshes
  and reveals the item. Otherwise it calls `dataProvider.refresh()`.
- A reported update calls `updateSession()` for script generation and `upsertSession()`
  for TriggerFlow, keeping today's difference, then refreshes or reveals the same way.

Because the reveal now happens after the write, `addTreeItem()`'s 200 ms timer no longer
has to cover the write. It stays so the tree has time to render the new item.

### Deletions use the same queue

`removeSession()` and `removeAllSessions()` are queued like the others.
`BaseSessionManager.deleteSession()` awaits the removal before refreshing the view.
`deleteAllSessions()` already awaits `removeAllSessions()`. Changes from messages the
panel sent before the delete-all started are queued ahead of the removal, so the removal
still clears them. Messages that arrive while it runs are still dropped by the existing
guard.

### The legacy migration is not queued

`migrateLegacySessions()` runs once on activation and is awaited before any storage
instance or manager is created, so nothing can overlap it. Routing it through the queue
would add no protection.

## Risks / Trade-offs

- [A slow settings write delays later saves] → Writes to workspace settings are local
  file writes. Only the order changes, not the amount of work.
- [Callers that ignored the returned promise now get rejections] → Every call site
  either awaits and handles the result or attaches a `catch` that logs, so no rejection
  is left unhandled.
