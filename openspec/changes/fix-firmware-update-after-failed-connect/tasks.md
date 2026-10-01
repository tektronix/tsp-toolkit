# Tasks

## 1. Reorder checks in `Connection.update()`

- [ ] 1.1 In `Connection.update()` (`src/connection.ts`), move the `statSync(filepath).size === 0` check (and its error message) above the `if (!this._terminal) await this.connect()` block. Verify with `npm run compile` and by reading the diff: an empty file returns before any connect call.
- [ ] 1.2 In the same method, use `connect()`'s boolean result: if it returns `false`, or `this._terminal` is still undefined afterwards, return without showing "Starting update on …" and without calling `sendText`. Move the `Log.debug("Terminal exists, sending .update")` call below that check so the log no longer claims a terminal that isn't there. Verify with `npm run compile`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: Update firmware no longer reports that an update started when it could not connect, and rejects an empty firmware file without connecting. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear in the changed files.
- [ ] 3.2 Manual check with "Run Extension". (a) On a connected instrument, pick a 0-byte `.upg` file: the empty-file error is shown and nothing is sent. (b) Pick a real firmware file only if a spare instrument is available, and confirm "Starting update" and `.update` in the terminal; otherwise just confirm the message appears and cancel on the instrument. (c) Start Update firmware on a connected instrument; while the file dialog is open, close the instrument terminal and unplug the instrument; then pick a non-empty file. The connect attempt fails or times out with its own message, and no "Starting update" message appears. Record the result, or note what could not be exercised.
