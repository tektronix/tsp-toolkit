# Design

## Context

`src/resourceManager.ts` builds `SUPPORTED_MODELS_DETAILS` when the module loads. It lists
the directories under `COMMAND_SETS`, removes `tsp-lua-5.0`, `nodes_definitions`, and the
three hard-coded module names, and attaches
`{ noOfSlots: 3, moduleOptions: [Empty, ...the three modules] }` to `MP5103`. The view
(`systemConfig.js`) and fetch validation (`ConifgWebView.ts`) read only that object.

In instrument-library 0.19.5, every directory has `AllTspCommands/definitions.lua` and
`tspLinkSupportedCommands/definitions.txt`. The slot-module directories (`MPSU50-2ST`,
`MSMU60-2`, `MSMU200-2`) are the only ones whose templates contain `$slot_number$`:
hundreds of occurrences each, against zero in every mainframe, MP5103 included. The
extension already depends on that placeholder: `createSlotCmdFile()` and
`createNodeSlotCmdFile()` in `workspaceManager.ts` substitute it to generate per-slot
definitions. Mainframes also have a `Helper` folder, except MP5103, so `Helper` can't be
used to tell the two apart.

## Goals / Non-Goals

**Goals:**

- Adding a slot-module directory to the package is enough for it to be offered and
  accepted. No extension change is needed.

**Non-Goals:**

- Deriving slot counts or mainframe-to-module compatibility from the package. Neither is
  in the package today.
- Changing the `nodes_definitions` and `tsp-lua-5.0` exclusions.

## Decisions

### Detect modules by the `$slot_number$` placeholder

A directory is a slot module when its `AllTspCommands/definitions.lua` contains
`$slot_number$`. This is the property that makes a library usable as a slot definition at
all. If a module lacked it, the generated `<MODULE>_slot<S>.lua` would not name its slot.
So detection and the existing generation can't disagree.

Alternatives considered:

- **Absence of `Helper`**: MP5103 has no `Helper` either, so it would be misclassified.
- **Name pattern (`MSMU*`, `MPSU*`)**: this is the same maintenance problem in a weaker
  form. A new family prefix would break it.
- **Ask the package to export a list or a manifest**: this is the cleanest long-term
  option and could replace the scan later without a spec change. It needs a release of
  `tsp-toolkit-webhelp-to-json`, though, and the placeholder already gives a reliable
  signal.

Reading one file per directory at load time is cheap: about 25 directories, done once,
and `resourceManager.ts` already does synchronous file-system calls at load.

### Keep the slotted-mainframe table, fill its module options from the scan

Keep a small table of slotted mainframes, today only `MP5103: { noOfSlots: 3 }`. Its
`moduleOptions` is set to `[Empty, ...sorted detected modules]` instead of a fixed list.
Sorting gives a stable order regardless of directory enumeration order on each platform.

### Fail closed per directory

If a directory's `AllTspCommands/definitions.lua` is missing or can't be read, treat the
directory as a mainframe (today's behavior for any unknown directory), and log it at
debug level. One bad directory shouldn't break loading the extension.

## Risks / Trade-offs

- [A future slotted mainframe might take a different set of modules] → Assigning every
  module to MP5103 would then be wrong for that mainframe. At that point, add per-mainframe
  compatibility, ideally as metadata in the package. This is recorded as an assumption in
  the proposal.
- [A future mainframe library might use `$slot_number$` for some other reason] → It would
  be classified as a module. Its definitions would also be generated incorrectly today,
  so the unit test pins the current package contents to catch this in a dependency bump.
- [The order of the MP5103 options changes] → Cosmetic only. Saved entries store module
  names.
