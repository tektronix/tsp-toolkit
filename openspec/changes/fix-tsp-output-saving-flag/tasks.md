# Tasks

## 1. Set `Saving` only after the command is sent

- [ ] 1.1 Change `Connection.startTspOutputSaving()` (`src/connection.ts`) to return `Promise<boolean>`: `true` when `.save --tsp --output` was sent to a terminal, and `false` when there is no terminal after the connect attempt. Verify with `npm run compile`.
- [ ] 1.2 In `Instrument.startSaveTspOutput()` (`src/instrument.ts`), remove the up-front `this.savingTspOutput = true` and the reset in the cancelled-dialog branch. Set `this.savingTspOutput = true` only when `startTspOutputSaving()` returns `true`. Because `connect()` clears the flag, the flag must be set after the call returns, not before. Verify with `npm run compile` and by reading the diff: every early `return` leaves the flag untouched.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: cancelling Start saving TSP output no longer leaves the instrument showing Stop saving. Verify that the section keeps Keep a Changelog order (Added before Fixed) and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear in the changed files.
- [ ] 3.2 Manual check with "Run Extension" and a connected instrument. (a) Start saving TSP output, cancel the save dialog: Start saving is still offered. (b) Start, choose a file: Stop saving is offered and the terminal shows `.save --tsp`. (c) Stop: Start saving is offered again. If a second instrument with no connected interface can show the action, also dismiss the "Which connection?" pick and confirm Start saving is still offered. Record the result, or note that no hardware was available.
