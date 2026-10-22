# Design

## Context

`GenericSessionStorage.migrateLegacySessions()` runs once on every activation, before the
Tools view and the session managers are created. It reads `tsp.script_generation`, and
reads `tsp.scriptGenSessions` and `tsp.triggerFlowSessions` to see whether they already
hold sessions. For each tool, it writes the legacy sessions over the new setting only if
the new setting has none, and then removes the legacy setting when every tool is
"accounted for". A tool counts as accounted for when its new setting already held
sessions, so its legacy sessions are dropped without being looked at.

Session names are unique per tool. The name prompt enforces that, and lookups by name
(`getSession()`, `updateSession()`) assume it. `config` is an opaque string produced by
the backend.

## Goals / Non-Goals

**Goals:**

- No legacy session is removed unless an identical session already exists in the new
  setting.
- Migration is idempotent. Running it again on the next activation changes nothing,
  except that conflicts the user has resolved stop being reported.
- Session names stay unique per tool.

**Non-Goals:**

- Restoring sessions that earlier versions have already discarded. They are gone from
  settings.
- Changing which scope migration reads from or writes to. Today it reads effective values
  and writes workspace settings. `fix-tool-session-scope-copy` covers scopes for the rest
  of the storage.
- Offering a UI to resolve conflicts beyond opening the settings file.

## Decisions

### Merge by name, compare `config` on a name match

For each tool, walk the legacy sessions in order against the current list of the new
setting (including sessions appended earlier in the same walk):

- No session with that name: append the legacy session.
- A session with that name and an equal `config` string: treat the legacy session as
  migrated and drop it.
- A session with that name and a different `config`: keep the legacy session as a
  conflict.

The new setting's existing entries are never changed or reordered. If anything was
appended, write `{ ...currentNewValue, [toolKey]: mergedList }`, so other keys in the
object survive. If nothing was appended, don't write. This also means two legacy sessions
with the same name end up as one migrated session plus one conflict (or one dropped
duplicate if their configs are equal), and names stay unique.

The walk is a pure function, for example
`mergeLegacySessions(legacy: SessionItem[], current: SessionItem[]): { merged: SessionItem[]; appended: number; conflicts: SessionItem[] }`,
in a new file that doesn't import `vscode`, so plain mocha can test it.

Alternatives considered:

- **Rename conflicting legacy sessions with a suffix** (for example `sweep (legacy)`).
  Names are limited to 20 characters and to letters, digits, spaces, dashes, and
  underscores, so a suffix often doesn't fit, and parentheses aren't allowed. The
  generated script's file name is `<name>.tsp`, so a renamed session would also stop
  matching the script it produced. Rejected.
- **Always let the legacy session overwrite.** This destroys a session the user created
  or edited in the new version. Rejected.
- **Always keep the new session and drop the legacy one** (today's behavior, applied per
  name). This still discards data without telling anyone. Rejected.

### Keep only conflicts in the legacy setting

After both tools are merged, build the remaining legacy object from the conflicts only,
under the same `I-V Characterization` and `Trigger Flow` keys, and leave out empty keys.
If nothing remains, remove `tsp.script_generation` from workspace settings as today.
Otherwise write the remaining object to workspace settings. Write the new settings first,
so a failure partway through never removes legacy sessions that weren't migrated. A
failure is still logged and doesn't stop activation.

### Warn on every activation while conflicts remain

When conflicts remain, show a warning such as:

> Some sessions in the old `tsp.script_generation` setting were not migrated because a
> different session with the same name already exists: I-V Characterization: `sweep`;
> TriggerFlow: `burst`. Rename or delete one copy in the workspace settings.

The warning offers "Open Settings", which runs
`workbench.action.openWorkspaceSettingsFile`. It isn't awaited, so activation doesn't
wait for the user.

The warning repeats on each activation for as long as conflicts remain. Conflicts only go
away when the user edits settings, so the warning is never shown "without reason": each
time it appears, unmigrated data is still sitting in a setting the extension otherwise
ignores. Remembering a dismissal in `globalState` was considered and rejected: the data
would stay hidden in an unused setting forever, which is what this change is meant to
stop.

## Risks / Trade-offs

- [Legacy data in user settings] Migration reads the effective value but removes the
  legacy setting only from workspace settings, as today. A legacy value in user settings
  is read again on every activation. → It merges as migrated or as conflicts and so stays
  stable. Moving scopes is out of scope.
- [Repeated warning] A user who ignores the warning sees it on every activation. →
  Accepted, as explained above. The message names the exact sessions, so it can be
  resolved in one edit.
