# Proposal

## Why

The `baseline-script-generation-and-trigger-flow` proposal records a known deviation:
Open Script failures are not reported. `openGeneratedScript()` in
`src/baseSessionManager.ts` calls `vscode.window.showTextDocument()` with `void` inside a
`try` block. The call returns a promise, so a failure, for example because
`<session>.tsp` doesn't exist in the first workspace folder, rejects after the `try` has
already finished. The `catch` that shows "Failed to open script: …" never runs, and the
user sees nothing happen.

## What Changes

- Opening the generated script waits for the editor to open, and any failure shows the
  existing error "Failed to open script: `<path>`. Error: `<message>`".
- Before opening, the extension checks that the script file exists. If it doesn't, it
  shows the error "Script not found: `<path>`" instead. The error VS Code returns for a
  missing file is a low-level file-system message, and a missing script is the most
  likely failure (the backend hasn't written it yet, or the user deleted or renamed it),
  so it gets a plain message. The wording doesn't guess which of those happened.
- Everything else stays as it is: the no-folder and no-session errors, the path, opening
  beside the panel, and doing nothing when the script is already visible.
- Add a changelog entry under 1.6.0 → Fixed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-backends`: "Opening the generated script" reports a missing script and any other
  failure to open it.

## Impact

- Code: `openGeneratedScript()` in `src/baseSessionManager.ts` becomes `async`, and the
  `OPEN_SCRIPT` case of `handleWebviewMessage()` calls it with `void`. The existence check
  uses `vscode.workspace.fs.stat()`. Neither subclass needs to change.
- `tool-backends` exists only in the unarchived
  `baseline-script-generation-and-trigger-flow` change. That change must be archived
  before this one.
