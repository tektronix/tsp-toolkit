# Tasks

## 1. Read the workspace value

- [ ] 1.1 In `loadSessions()` in `src/genericSessionStorage.ts`, replace `get<SessionCollection>("tsp.<key>")` with `inspect<SessionCollection>("tsp.<key>")?.workspaceValue`, defaulting to `{}`. Return a copy whose tool arrays are also copies, so `addSession()`, `updateSession()`, `removeSession()`, and `removeAllSessions()` never change the object VS Code returned. Leave `updateSettings()` writing to workspace settings and leave `migrateLegacySessions()` unchanged. Verify with `npm run compile` and by reading the diff: `loadSessions()` no longer calls `get()`, and every write still goes through `updateSettings()`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: Script Generation and TriggerFlow sessions defined in user settings are no longer copied into the workspace when a session changes. Sessions are now read from workspace settings only, so sessions defined only in user settings are no longer shown. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension", with a TSP-Link system saved in the test folder. (a) Put a TriggerFlow session `shared` in user `tsp.triggerFlowSessions` and none in the workspace: the TriggerFlow node lists no sessions, and Reset to Defaults skips "Delete TriggerFlow Sessions". (b) Create a TriggerFlow session `burst` and let the backend save it: workspace settings hold only `burst`, and user settings still hold `shared`. (c) Delete `burst`: workspace settings hold an empty list and user settings are unchanged. (d) A workspace whose settings already hold copied sessions still lists them. Record the results.
- [ ] 3.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-sessions/spec.md` exists. Compare its "Session storage" requirement with this change's delta and re-apply this change's edits if the baseline text has changed. If `fix-legacy-session-discard` has been applied, make migration read the new settings from the workspace value too. If `fix-tool-session-write-race` has been applied, confirm that its serialized changes read through `loadSessions()`. Verify with `openspec validate fix-tool-session-scope-copy`.
