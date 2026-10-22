# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
session names are not trimmed when saved. The name prompt for a new script generation or
TriggerFlow session rejects names that are empty, longer than 20 characters, badly formed,
or duplicates, all after trimming, but keeps the name as typed. Leading and trailing
spaces therefore become part of the stored session name, of the item shown in the Tools
view, and of the generated script's file name, so `" sweep "` produces `" sweep .tsp"` in
the workspace folder.

## What Changes

- The name accepted by the prompt is trimmed before it is used. The trimmed name becomes
  the tool's current session name, so it is the name saved when the backend reports the
  session, the name sent in the session path, and the base of the generated script's file
  name.
- The validation rules don't change. A name is still checked after trimming.
- Sessions already saved with surrounding spaces are left as they are, and recalling
  them still uses the stored name.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-sessions`: "Creating a session" keeps the trimmed name instead of the name as
  typed.

## Impact

- Code: `createNewSession()` in `src/scriptGenWebViewManager.ts` and
  `src/triggerFlowWebViewManager.ts`. `SessionNameValidator.validateName()` in
  `src/genericSessionStorage.ts` already trims before checking and needs no change.
- `tool-sessions` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
