# Tasks

## 1. Show Update address on offline connections

- [ ] 1.1 In `package.json`, change the `when` clause of the `InstrumentsExplorer.updateInstrumentAddr` entry in `view/item/context` so it matches `Enabled` connections that are `Active` or `Inactive`, for example `view == InstrumentsExplorer && viewItem =~ /CONN(Active|Inactive)Enabled/`. The match is case-sensitive, so `Active` does not match inside `Inactive`; keep it that way. Verify by reading the diff against the context-value format in `instrument-connection-lifecycle` ("Tree item context values"): `CONNInactiveEnabled` and `CONNActiveEnabled` match, while `CONNConnectingEnabled`, `CONNConnectedEnabled`, and `CONNActiveDisabled` don't.
- [ ] 1.2 Confirm that `updateInstrumentAddr()` in `src/instrumentExplorer.ts` needs no change for an `Inactive` connection: it should not read the connection status, and it should write the saved entries through `updateSaved()`. Verify by reading the method. If it turns out to need a change, make it and run `npm run compile`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: Update Instrument Address is now offered for offline instruments, so a saved instrument that moved to a new address can be corrected. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) Save a LAN instrument, then unplug it or move it to another address so that it shows under "Offline Instruments": Update address is shown on its connection. (b) Enter the new address: the connection shows it, the stored LAN entry's `instr_address` changes in user `settings.json`, and once the instrument is reachable the next refresh cycle makes the connection `Active`. (c) While a connection is `Connecting` or `Connected`, Update address is not shown. Record the results, or note what could not be exercised.
- [ ] 3.3 Before archiving, check whether `fix-palette-instrument-commands` has already been archived. If it has, re-copy "Action availability by state" from `openspec/specs/instrument-connection-lifecycle/spec.md` into this change's delta, re-apply this change's edits, and verify with `openspec validate fix-update-address-offline`.
