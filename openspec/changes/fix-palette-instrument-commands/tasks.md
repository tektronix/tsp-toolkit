# Tasks

## 1. Hide the commands from the Command Palette

- [ ] 1.1 In `package.json`, add `{ "command": "InstrumentsExplorer.rename", "when": "false" }` and `{ "command": "InstrumentsExplorer.updateInstrumentAddr", "when": "false" }` to `contributes.menus.commandPalette`, next to the existing `save`, `remove`, and `updateFirmware` entries. Leave the `view/item/context` entries unchanged. Verify with `node -e "console.log(require('./package.json').contributes.menus.commandPalette)"`: both commands should be listed with `when: 'false'`.

## 2. Changelog

- [ ] 2.1 Add a `### Fixed` entry under `## [1.6.0]` in `CHANGELOG.md`: Rename and Update Instrument Address no longer appear in the Command Palette, where they could not act on an instrument. Verify that the section keeps Keep a Changelog order and doesn't duplicate an entry from another fix change.

## 3. Integration checks

- [ ] 3.1 Run `npm run lint`, `npx prettier --list-different src`, and `npx mocha --config .mocharc.yml`, and verify that no new warnings or failures appear.
- [ ] 3.2 Manual check with "Run Extension". (a) In the Command Palette, search for "Rename" and "Update Instrument Address": the Instruments view commands are not listed. (b) In the Instruments view, Rename on a saved instrument and Update address on an `Active` connection are still shown and still work. Record the results.
- [ ] 3.3 Before archiving, check whether `fix-update-address-offline` has already been archived. If it has, re-copy "Action availability by state" from `openspec/specs/instrument-connection-lifecycle/spec.md` into this change's delta, re-apply this change's edits, and verify with `openspec validate fix-palette-instrument-commands`.
