# Spec Delta

## Purpose

Let users locate online and offline instruments through a native search input that filters the Instruments explorer live while preserving instrument management and connection behavior.

## ADDED Requirements

### Requirement: Discoverable native search input
The Instruments explorer SHALL provide a Search action beside its existing title-bar actions. Search SHALL open a native VS Code text input pre-filled with the current query, without requiring Ctrl+F or replacing the explorer with a webview. Only one search input SHALL be active at a time.

#### Scenario: Open search from the explorer
- **WHEN** the user clicks Search in the Instruments title bar
- **THEN** a native text input opens with the current query and accepts instrument search text
- **AND** the existing Add action and conditionally available Refresh action remain available

#### Scenario: Invoke search while already open
- **WHEN** Search is invoked while its input is already open
- **THEN** the existing search session is reused rather than creating a second independent session

### Requirement: Live multi-field matching
The explorer SHALL update matching instruments on each input change without requiring Enter. Matching SHALL use case-insensitive literal substring comparison of the trimmed query against friendly name, model, serial number, manufacturer, and each connection address independently. An instrument SHALL match when any field contains the query.

#### Scenario: Search by an instrument field
- **WHEN** the user types a partial name, model, serial number, or manufacturer with different letter casing
- **THEN** the tree shows instruments whose corresponding field contains that text
- **AND** nonmatching instruments are hidden without waiting for Enter

#### Scenario: Search by connection address
- **WHEN** the user types a substring of an IP address or VISA resource string belonging to an instrument
- **THEN** that instrument appears even if its name and identification fields do not match
- **AND** all its connection children remain available

#### Scenario: Treat punctuation literally
- **WHEN** the user types dots, colons, or other query punctuation
- **THEN** those characters are matched literally rather than interpreted as regular expressions or query operators

### Requirement: Search covers online and offline instruments
The search SHALL include every instrument known to the explorer regardless of online or offline grouping. Matching offline instruments SHALL be visible in an initially expanded Offline Instruments group without a separate expansion action. Empty groups SHALL be omitted while filtering; normal grouping SHALL return when filtering is cleared.

#### Scenario: Find a saved offline instrument
- **WHEN** the user searches for an offline instrument while the normal Offline Instruments group is collapsed
- **THEN** the matching instrument is visible under the expanded search-time Offline Instruments group

#### Scenario: No offline matches
- **WHEN** the query matches online instruments but no offline instruments
- **THEN** matching online instruments appear and no empty Offline Instruments group is displayed

### Requirement: Accept and cancel search sessions
Enter SHALL close the search input and retain the current query. Escape or another unaccepted dismissal SHALL restore the query that was active when the input opened. Reopening Search SHALL pre-fill the retained query. Moving focus away SHALL NOT automatically dismiss the input.

#### Scenario: Accept a live filter
- **WHEN** the user types a query and presses Enter
- **THEN** the input closes and the tree remains filtered by that query

#### Scenario: Cancel changes to an existing filter
- **WHEN** the user opens Search with an existing query, edits it, and presses Escape
- **THEN** the previous query and its corresponding tree results are restored

#### Scenario: Cancel an initial search
- **WHEN** no query was active before opening Search and the user dismisses it without accepting
- **THEN** the tree returns to its unfiltered state

### Requirement: Reveal one unique exact match on Enter
When the user accepts a search with Enter, the explorer SHALL compare the trimmed query case-insensitively for equality against each searchable field of all known instruments. If exactly one distinct instrument has an exact field match, the explorer SHALL reveal and select it, expanding its parent group if needed, while retaining the filter. This navigation SHALL NOT connect to the instrument.

#### Scenario: One exact instrument among partial matches
- **WHEN** Enter is pressed and one distinct instrument has a searchable field exactly equal to the query while other instruments only partially match
- **THEN** the exact-matching instrument is revealed and selected, with the accepted filter still active

#### Scenario: Multiple exact fields on one instrument
- **WHEN** more than one searchable field on the same instrument exactly equals the query
- **THEN** that instrument counts as one exact match and is revealed and selected

#### Scenario: Ambiguous or absent exact match
- **WHEN** zero or multiple distinct instruments have an exact field match
- **THEN** the query is accepted and results remain filtered without automatically revealing or selecting an instrument

#### Scenario: Reveal an offline exact match
- **WHEN** exactly one offline instrument has a searchable field exactly equal to the accepted query
- **THEN** its Offline Instruments parent is expanded as needed and the instrument is revealed and selected

### Requirement: Clear active filtering without status text
The explorer SHALL provide a Clear Search action while a nonempty filter is active. The Instruments view SHALL NOT display a search-status message for active queries or empty results. Clearing or entering only whitespace SHALL restore the unfiltered tree and remove the Clear Search action.

#### Scenario: Clear an accepted search
- **WHEN** the user invokes Clear Search with an active query
- **THEN** normal grouping returns and the query and Clear Search action are cleared

#### Scenario: Clear while editing
- **WHEN** the user invokes Clear Search while the search input is open
- **THEN** filtering is cleared and the editing session ends without restoring its previous query

#### Scenario: No results
- **WHEN** a nonempty query matches no instruments
- **THEN** the tree shows no instrument or empty-group rows and the view displays no search-status message
- **AND** the input remains available for further typing until accepted or dismissed

#### Scenario: Empty query
- **WHEN** the user deletes the query or enters only whitespace
- **THEN** the tree immediately returns to its normal unfiltered state

### Requirement: Search is display-only and refresh-consistent
Filtering SHALL NOT delete, save, disconnect, or otherwise modify instruments or connections. The current query SHALL survive discovery refreshes and reapply to updated instrument data. Queries SHALL remain session-local and SHALL NOT be persisted across extension reloads.

#### Scenario: Discovery changes while filtering
- **WHEN** a refresh adds, updates, or removes instruments while a query is active
- **THEN** the query remains active and displayed matches reflect the updated inventory

#### Scenario: Hidden connected instrument
- **WHEN** an active query hides a connected instrument
- **THEN** its connection continues unaffected and clearing the filter makes it visible again

#### Scenario: Reload the extension
- **WHEN** the extension reloads after a query was accepted
- **THEN** the Instruments explorer starts without an active search query