# Design

## Context

See proposal.md for motivation and specs/instrument-search/spec.md for the behavior contract.

The extension creates a native TreeView in src/instrumentExplorer.ts. Its title actions are contributed through package.json; Refresh is currently hidden when auto-refresh is enabled, and `InstrumentsExplorer.connect` is the Add connection action. The minimum supported VS Code version is 1.92.0.

InstrumentProvider owns the full inventory. Its getChildren method places Active, Connecting, and Connected instruments at the root, with Inactive and Ignored instruments beneath a newly created, collapsed InactiveInstrumentList sentinel. It currently has no getParent implementation. Instrument exposes name and identification info; connections expose address and parent instrument. Instrument.status may update status and connection state, so matching must not rely on it for side effects.

The project uses TypeScript, Mocha, and Chai. Existing tests are under src/test and the Mocha configuration registers ts-node.

## Goals / Non-Goals

**Goals:**
- Keep search input, matching, and tree projection within the existing native explorer.
- Isolate literal matching so it is testable without hardware discovery.
- Preserve the provider's complete inventory and all existing instrument actions.
- Support exact-match reveal for both root and offline instruments through the tree's parent relationships.

**Non-Goals:**
- Rework instrument discovery, saved-instrument persistence, or connection status behavior.
- Add fuzzy matching, query operators, result picker, webview, or persisted query state.
- Select an instrument automatically while the user is still typing.

## Decisions

### Native title actions and managed input

Contribute Search and Clear Search icons to the Instruments view/title menu alongside Refresh and Add connection. Keep Refresh's current auto-refresh visibility condition. Gate Clear Search on a dedicated active-filter context key.

Use `window.createInputBox` because live filtering needs onDidChangeValue and explicit accept/hide lifecycle events. Keep one input session at a time, prefill it from the provider's current query, and set ignoreFocusOut so focus transitions do not cancel the filter. Update the provider as the input changes. On Enter, mark the session accepted before hiding; on unaccepted dismissal, restore the query that was active when the session opened. Clear Search clears the filter and terminates any open input without restoring its baseline.

### Pure literal search matching

Use a small pure predicate over structural fields: friendly name, model, serial number, manufacturer, and each connection address. Trim and case-fold the query, then perform literal substring checks against each field independently. A blank normalized query matches all instruments. Do not concatenate fields, interpret punctuation as syntax, or access status during matching.

Exact-match navigation uses equality against each normalized searchable field, not substring containment. Deduplicate by instrument identity so several exact fields or connections on one instrument still count once; reveal only when one distinct instrument matches exactly.

### Provider projection and feedback

Keep search query state local to the extension session in InstrumentProvider and fire its existing tree-change event when the query changes. Filter only getChildren output; keep the public instruments collection complete and preserve original instrument and connection objects. A matching instrument retains all connection children.

Refresh or inventory mutations reuse the current query and reapply the tree projection. Do not trigger discovery, configuration writes, or instrument state changes from keystrokes; do not display search result counts or query-status text.

### Offline group identity and parent relationships

Preserve the existing collapsed offline sentinel when unfiltered. During filtering, create a search-specific sentinel with Expanded initial state and a stable TreeItem id for that filtering period. Include it only if offline instruments match. When the query transitions from empty to nonempty after clearing, use a new identity so the group starts expanded again.

Implement getParent so an offline instrument returns the current search sentinel and a connection returns its owning instrument; online instruments remain roots. Return the exact same sentinel instance from getChildren and getParent. This is needed because VS Code TreeView.reveal requires a provider with getParent and must expand an instrument's ancestors before reveal. On Enter, call reveal with select and focus enabled only for the unique exact match. Reveal must not trigger connect behavior.

### Search visibility state

Do not set TreeView.message for search state. Keep only the active-filter context key needed to show or hide Clear Search; update it from query and inventory-change notifications. A query with no matches naturally produces no instrument rows and no additional status text.

## Risks / Trade-offs

- [VS Code may retain tree collapse state across query edits] -> Give the search-time offline sentinel a stable id within a filtering period and a new id after clear; verify in the extension host.
- [Reveal fails for offline results if parent identity differs] -> Return the same search sentinel instance from getParent and getChildren and test both relationships.
- [Multiple fields or connections produce false ambiguity] -> Count distinct instrument objects, not field or connection matches.
- [Cancel races with explicit clear] -> Mark clear/accept state before hiding the input and test the hide callback behavior.
- [Auto-refresh changes filtered results] -> Keep the query independent of inventory updates and reapply the filter on provider changes.
- [Filtering hides a connected instrument] -> Change only the displayed tree projection; do not modify connection state or full inventory.
- [Mocha and VS Code dependencies complicate provider tests] -> Cover the pure matcher and projection with structural fixtures; verify reveal and native input behavior in the extension development host.

## Migration Plan

No stored settings or inventory data change. Ship the commands, input lifecycle, and filtered projection together. Run matcher/projection tests, existing tests, compile, and lint, then manually verify toolbar placement, input behavior, exact-match reveal, offline parent expansion, and refresh behavior in the extension development host.

Rollback removes the search commands and filtering/reveal code. Since the query is session-local, rollback requires no data migration or cleanup.