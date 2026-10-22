# Proposal

## Why

Users need to locate instruments by model, friendly name, serial number, or connection address without scanning the Instruments tree. A discoverable Search button with live filtering provides this workflow while retaining the native explorer and its existing instrument actions.

## What Changes

- Add a Search icon alongside the existing Refresh and Add connection actions in the Instruments view title.
- Open a native VS Code input box and filter the tree as the user types, without requiring Ctrl+F or replacing the tree with a webview.
- Match case-insensitive partial text against friendly name, model, serial number, manufacturer, and all connection addresses, including IP and VISA resource strings.
- Include online and offline instruments, retain all connections of matching instruments, and expose offline matches without manual group expansion.
- Provide a Clear Search action while filtering; do not display search-status text in the Instruments view.
- Retain the query across discovery refreshes during the current extension session without changing instrument data or connection state.
- On Enter, retain the filter and reveal/select the instrument if exactly one distinct instrument has a case-insensitive exact match against any searchable field; do not jump for partial-only or ambiguous matches. Escape or other unaccepted dismissal restores the previous query; reopening Search pre-fills the current query; empty input clears filtering.

## Capabilities

### New Capabilities

- `instrument-search`: Native instrument search input, live multi-field tree filtering, clearing, exact-match navigation, and refresh consistency.

### Modified Capabilities

None. The project currently has no durable capability specs.

## Impact

- `package.json`: Search and Clear Search command contributions and Instruments view-title menu entries.
- `src/instrumentExplorer.ts`: Native input lifecycle, command registration, reveal behavior, and filter-session ownership.
- `src/instrumentProvider.ts`: Display-only query state, matching, filtering of both tree branches, and parent relationships needed to reveal offline exact matches.
- `src/instrument.ts`: Offline-group presentation if necessary to expose filtered matches.
- `src/test/`: Focused Mocha/Chai coverage for matching, tree projection, reveal decisions, and input lifecycle using suitable test fixtures.
- Stable VS Code APIs compatible with the existing minimum version; no new runtime dependencies or persisted settings.
- Out of scope: a webview redesign, built-in tree Find integration, advanced query syntax, fuzzy ranking, firmware/category/status search, and persistence across window reloads.