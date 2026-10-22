# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
theme listeners pile up. Each time a tool's panel opens successfully, `openPanel()` calls
`setupThemeChangeListener()`, which registers a new `onDidChangeActiveColorTheme`
listener and discards the disposable. None of them are ever removed. After a tool's panel
has been closed and reopened `n` times, one theme change sends `n + 1` refresh signals to
that tool's backend, and the listeners stay alive until the extension host shuts down.

## What Changes

- Each tool manager registers a single theme listener for its whole lifetime, and the
  listener is disposed with the extension. Opening a panel no longer registers one.
- One theme change sends exactly one refresh signal to a tool's backend while its panel
  is open, however often the panel has been closed and reopened.
- The listener still sends nothing while the tool has no panel or no backend process, as
  today.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-backends`: "Theme changes" sends exactly one refresh signal per theme change and
  none while the panel is closed.

## Impact

- Code: `BaseSessionManager` in `src/baseSessionManager.ts`: the constructor,
  `openPanel()`, and `setupThemeChangeListener()`. Neither subclass needs to change.
- `fix-tool-panel-load-failure` moves the panel-disposal setup in `openPanel()` so it runs
  even when loading fails. Because this change takes theme listening out of `openPanel()`
  entirely, the two changes touch neighboring lines but don't depend on each other's
  order. Whichever is applied second must keep `setupThemeChangeListener()` out of
  `openPanel()`.
- `tool-backends` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
