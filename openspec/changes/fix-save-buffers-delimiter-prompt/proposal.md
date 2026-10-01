# Proposal

## Why

The `instrument-terminal-operations` baseline recorded a known deviation in Save buffers to
a file. Pressing Escape on the delimiter prompt falls back to `,` and carries on, while
accepting an empty delimiter silently ends the flow. That is backwards from the prompt's
own hint ("default: `,`") and from every other prompt in the same flow, where dismissing
the prompt cancels.

## What Changes

- **BREAKING (UX):** pressing Escape on the delimiter prompt cancels Save buffers to a
  file, like the buffer-name, field, and output-file prompts already do. Users who pressed
  Escape to accept the default `,` now need to press Enter instead.
- Accepting an empty delimiter uses the default `,`.
- Add a changelog entry under 1.6.0 → Changed (Escape now cancels) and Fixed (empty input
  uses the default).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instrument-terminal-operations`: the "Saving buffers to a file" requirement changes what
  Escape and empty input mean at the delimiter prompt.

## Impact

- Code: `src/instrument.ts` (`Instrument.saveBufferContents()`).
- User-visible: Escape on the delimiter prompt now cancels; Enter on an empty prompt now
  uses `,` instead of silently doing nothing.
- No settings, commands, menus, or `contextValue` strings change. The `.save --buffer …`
  command line sent to the terminal is unchanged.
