# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation: system
names are not trimmed when saved. The view and the name prompt both reject names that are
empty after trimming, or whose trimmed form matches an existing system, but they save the
name as typed. `"bench "` can therefore be saved next to `"bench"`. The two look the same
in the selector, and the duplicate check, which compares the trimmed input with stored
names, can't tell them apart afterwards.

## What Changes

- Names are trimmed before they are saved, in every path that creates a system: the Add
  form, naming a fetched system, and naming a migrated legacy configuration. The
  activation message uses the trimmed name.
- The validation rules don't change. A name is still rejected if it is empty after
  trimming or if its trimmed form matches an existing name.
- Names already saved with surrounding spaces are left as they are. Editing a saved
  system doesn't change its name, which is read-only.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-link-system-configurations`: "Adding a system", "Naming a fetched system", and
  "Legacy system configuration migration" save the trimmed name.

## Impact

- Code: the `add` case of the message handler and `getNewSystemName()` in
  `src/ConifgWebView.ts`. `getNewSystemName()` is shared by the fetch and migration paths,
  so trimming its return value covers both. No change in `src/systemConfig.js` is needed,
  because the extension-side `add` handler is the single place the Add form's name is
  saved.
- `fix-fetch-nodes-multi-root` changes how the fetched entry reaches the setting, but not
  the naming step, and modifies a different requirement.
- `tsp-link-system-configurations` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
