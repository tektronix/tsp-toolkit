# Tasks

## 1. Literal Multi-Field Matching

- [x] 1.1 Add a pure instrument-search matcher over name, model, serial number, manufacturer, and connection addresses; add Mocha/Chai tests for case-insensitive substring matching across every field and IP/VISA addresses, and verify the focused suite passes without VS Code or hardware discovery.
- [x] 1.2 Cover trimming, empty/whitespace queries, missing fields, literal punctuation, multiple addresses, and nonmatches in matcher tests; verify the focused matcher suite passes.

## 2. Display-Only Provider Filtering

- [x] 2.1 Add session-local query state and update notifications to InstrumentProvider; filter online root items and offline children through the pure matcher without changing the full instruments collection, and verify returned object identities and connection state remain unchanged in tests.
- [x] 2.2 Add an expanded search-time offline group with stable identity for each filtering period, omit it when no offline items match, restore normal grouping when cleared, and implement parent lookup for offline instruments and connections; verify offline address matching and connection preservation in projection tests, and compile the provider.
- [x] 2.3 Preserve the query across discovery and saved-list reloads; verify additions, updates, removals, and online/offline transitions reapply the filter.
- [x] 2.4 Verify existing reload notifications update searchable fields and addresses; add only missing notifications and test that filtered rows update without discovery or configuration writes on keystrokes.

## 3. Native Search Input and Toolbar

- [x] 3.1 Register Search and Clear Search commands and contribute ordered Instruments view-title icons beside existing Refresh and Add actions; verify command visibility is scoped to the Instruments view and Refresh retains its auto-refresh condition.
- [x] 3.2 Create one managed native VS Code input with current-query prefill, focus retention, and live value updates; verify mocked input changes filter immediately and repeated invocation reuses the active session.
- [x] 3.3 Implement accept/cancel/clear lifecycle behavior; verify Enter retains the query, Escape restores the previous query (or unfiltered state), whitespace clears, and explicit Clear Search does not restore the baseline.
- [x] 3.4 On Enter, compare the trimmed query to every searchable field using case-insensitive whole-field equality and reveal/select only one distinct matching instrument, retaining the filter and never connecting; verify multiple exact fields on one item deduplicate while ambiguous, partial-only, and absent exact matches do not jump.
- [x] 3.5 Update Clear Search visibility from query and inventory changes without displaying search-status text; verify live updates, refresh changes, zero-result empty rows, clear, and rapid state transitions.
- [x] 3.6 Dispose commands, subscriptions, input listeners, and active input with their owning lifecycle; verify repeated open/close and disposal produce no duplicate handlers or late query restoration.

## 4. Integrated Acceptance Checks

- [ ] 4.1 Run focused search tests, `npm test`, `npm run compile`, and `npm run lint`; verify no new failures and report unrelated existing failures separately.
- [ ] 4.2 In the extension development host, verify native Search placement, live filtering, Enter/Escape behavior, prefill, clear, no instrument rows for unmatched queries without status text, unique exact-match reveal, and no jump for ambiguous or partial-only results with auto-refresh both enabled and disabled.
- [ ] 4.3 In the extension development host, begin with Offline Instruments collapsed, search for offline model/serial/address, accept a unique exact match, clear and search again, and refresh while filtering; verify offline items become visible, exact reveal expands and selects the instrument, filtering stays current, and connection actions still work.
- [ ] 4.4 Reload the extension after accepting a query and verify search starts unfiltered, no query setting is persisted, and behavior works without Ctrl+F or a webview on the minimum supported VS Code API.