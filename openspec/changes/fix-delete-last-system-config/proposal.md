# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation:
deleting the last saved system configuration throws. After the list becomes empty, the
delete handler activates `systemInfo[0].name`, which is `undefined[0]`. The setting has
already been written by then, so the visible effect is small (no message, an error in the
extension host log), but the handler never finishes and any work after it is skipped.

## What Changes

- When deleting a system leaves the list empty, the view shows its empty state and the
  extension does not try to activate anything. No activation message is shown and no error
  is thrown.
- Deleting when other systems remain keeps today's behavior: the first remaining system is
  selected and activated.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-link-system-configurations`: "Deleting a system" adds the empty-list case.

## Impact

- Code: the `delete` case of the message handler in `src/ConifgWebView.ts`.
- `tsp-link-system-configurations` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
- Out of scope: deleting an inactive system still activates the first remaining system.
  The baseline records that as current behavior. It is not one of the known deviations.
