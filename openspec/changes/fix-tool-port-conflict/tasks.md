# Tasks

## 1. Probe the port before starting a backend

- [ ] 1.1 Add a `isPortInUse(port: number, timeoutMs: number): Promise<boolean>` helper in a new file under `src/` that doesn't import `vscode`. It connects to `127.0.0.1:<port>` with `node:net`, resolves `true` on connect (closing the socket) and `false` on error or timeout. Add `src/test/portProbe.test.ts` (TDD UI) covering: a port with a test `net.Server` listening returns `true`; a port that was just closed returns `false`. Verify with `npx mocha --no-config -r ts-node/register --ui tdd src/test/portProbe.test.ts`.
- [ ] 1.2 In `src/baseSessionManager.ts`, add `protected async startBackend(): Promise<boolean>` as described in `design.md`: return `true` when a live process is held, otherwise probe the port, return `false` if it is in use, and otherwise call `spawnChildProcess()` and return `true`. Add `protected async showPortInUse(): Promise<void>` that creates or reveals the panel, sets `<h1>Port <port> is already in use</h1>`, shows the error message from the spec using `config.panelTitle`, and registers a disposal handler that only sets `this.panel = undefined`. Verify with `npm run compile`.
- [ ] 1.3 In `handleViewCommand()` and `createNewSession()` of `src/scriptGenWebViewManager.ts` and `src/triggerFlowWebViewManager.ts`, replace `spawnChildProcess()` with `await this.startBackend()`. On `false`, call `showPortInUse()` and return before any stdin message, `openPanel()`, or `setActiveStatus()`. In TriggerFlow's running-backend branch, keep sending the reset without probing. Verify with `npm run compile`, and by searching `src/` to confirm that `spawnChildProcess()` is called only from `startBackend()`.

## 2. Report a backend that exits during startup

- [ ] 2.1 In `src/baseSessionManager.ts`, make `checkServerReady()` stop when the process held at the start of the wait emits `exit`, rejecting with a distinct error, and make `openPanel()` show `<h1><panel title> stopped before it was ready</h1>` for that error and keep "Error starting server or loading content" for the others. Verify with `npm run compile`, and manually by pointing the executable path at a program that exits at once: the panel shows the new text within a second.

## 3. Changelog

- [ ] 3.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: Script Generation and TriggerFlow no longer show another VS Code window's session when the tool is already open there; instead they explain that the tool's port is in use. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 4. Integration checks

- [ ] 4.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 4.2 Manual check with "Run Extension" and a second VS Code window with the same build. (a) Open a script generation session in window 1, then one in window 2: window 2 shows "Port 27950 is already in use" and the error message, and window 1's session is not shown. (b) Repeat for TriggerFlow with port 27951. (c) Close the tool in window 1, wait a few seconds, and retry in window 2: it opens normally. (d) In one window only, open, close, and reopen each tool: no port error appears. Record the results.
- [ ] 4.3 Before archiving, confirm that `baseline-script-generation-and-trigger-flow` has been archived, so `openspec/specs/tool-backends/spec.md` exists. Compare its "Tool backends" and "Opening a tool panel" requirements with this change's delta and re-apply this change's edits if the baseline text has changed. If `fix-tool-panel-load-failure` was archived first, re-apply this change's edits to "Opening a tool panel" on top of its text. Verify with `openspec validate fix-tool-port-conflict`.
