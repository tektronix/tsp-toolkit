# Proposal

## Why

The `baseline-tsp-link-and-language-workspace` proposal records a known deviation:
fetching a TSP-Link system has no effect in a multi-root workspace. The fetch action sends
`.nodes "<first folder>/.vscode/settings.json"`, so the instrument backend writes the
fetched entry straight into the first folder's settings file.
`tsp.tspLinkSystemConfigurations` is window-scoped, and in a multi-root workspace VS Code
ignores folder-level values for window-scoped settings. The entry is written, but the
extension never sees it, so it is never named or activated. The view's own edits go to
the `.code-workspace` file instead, so the two paths don't even write to the same file.

## What Changes

- The fetch action tells the backend to write into a temporary file owned by the
  extension, not into a workspace settings file.
- When the backend has written the fetched entry, the extension reads it, appends it to
  `tsp.tspLinkSystemConfigurations` through the VS Code settings API at the workspace
  target (the same target the view uses), and deletes the temporary file. In a
  single-folder workspace that is still `.vscode/settings.json`. In a multi-root workspace
  it is the `.code-workspace` file.
- The existing flow then runs unchanged: it validates the unnamed entry, asks for a name,
  and activates the system.
- If nothing arrives within a time limit, the extension stops waiting, deletes the
  temporary file, and shows a warning that no TSP-Link configuration was received.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tsp-link-system-configurations`: "Fetching a system from an instrument" describes the
  temporary file, how the entry is added through the settings API, and the timeout.

## Impact

- Code: `Connection.getNodes()` in `src/connection.ts` (it takes the target file path
  rather than a folder) and the `systemConfigurations.fetchConnectionNodes` command in
  `src/extension.ts`. The temporary file and the wait are new code, probably next to the
  command or in `ConifgWebView.ts`, which already owns writes to the setting.
- Dependency on the kic-cli `.nodes` command: it writes a JSON settings file containing
  `tsp.tspLinkSystemConfigurations`. The extension depends on that format, which is already
  true today. Whether `.nodes` needs the file to exist first must be checked (see
  `tasks.md`).
- `tsp-link-system-configurations` exists only in the unarchived
  `baseline-tsp-link-and-language-workspace` change. That change must be archived before
  this one.
