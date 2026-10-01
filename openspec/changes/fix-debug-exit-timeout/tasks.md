# Tasks

## 1. Bounded exit with forced close

- [ ] 1.1 In `Connection.exitConnection()` (`src/connection.ts`), add a module-level constant for the 5 s limit (e.g. `EXIT_TIMEOUT_MS = 5000`). Race the existing 100 ms poll against a timer, and make sure the interval and the timer are both cleared on every path. Verify with `npm run compile`.
- [ ] 1.2 On timeout, follow design Decision 2. Capture the terminal, set `this._terminal = undefined` and `this.status = ConnectionStatus.Active`, log with `Log.warn` (using the method's `SourceLocation`), then call `dispose()` on the captured terminal. Add a comment explaining that clearing `_terminal` first is what keeps the `onDidCloseTerminal` handler in `runConnectFlow()` from scheduling a reset. Verify with `npm run compile` and by reading the diff: no `reset()` is reachable from the timeout path.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: debugging no longer hangs when the instrument terminal doesn't close after `.exit`. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear in the changed files.
- [ ] 3.2 Manual check with "Run Extension" and a connected instrument. (a) Normal case: start debugging a `.tsp` file; the terminal closes, the debugger starts, and the log shows no forced-close warning and no reset. (b) Timeout case: make `.exit` fail to close the terminal (e.g. run a long-running script in the terminal first, or temporarily skip `sendText(".exit")` in a local build). Start debugging and confirm that after about 5 s the warning is logged, the terminal closes, the connection shows `Active`, the debugger starts, and no reset is logged. Revert any temporary code. Record the result, or note that no hardware was available.
