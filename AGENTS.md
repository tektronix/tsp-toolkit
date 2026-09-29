# AGENTS.md

Guidance for AI coding agents working in the `tsp-toolkit` repository.

## What this is

A VS Code extension (TypeScript, entry `src/extension.ts` → `out/extension.js`) for
Tektronix/Keithley instruments that run TSP (Test Script Processor, Lua 5.1-based). The
TypeScript side is mostly UI and orchestration. Instrument communication, discovery,
debugging, script generation, and TSP→Python conversion are done by **prebuilt Rust
binaries/addons pulled in as per-platform npm packages** from the GitHub npm registry
(`@tektronix/*`, which needs a token in `.npmrc`).

## Commands

- `npm install`: needs access to `npm.pkg.github.com` for the `@tektronix/*` packages
- `npm run compile`: runs `tsc` and then copies the static `src/**/*.{js,css}` (webview
  scripts/styles) into `out/`. Use this rather than bare `tsc` if you touch those files.
- `npm run watch`: incremental `tsc` (this does **not** copy static files)
- `npm run lint`: runs `eslint src --ext ts`. CI runs
  `npx eslint --rule "{ prettier/prettier: off }" src` and checks formatting separately
  with `npx prettier --list-different`.
- `npm test`: runs mocha through ts-node on `src/test/*.test.ts` (TDD UI:
  `suite`/`test`). `pretest` compiles and lints first, so run mocha directly when
  iterating:
  - Single file (no config, so the config's `spec` glob isn't added):
    `npx mocha --no-config -r ts-node/register --ui tdd src/test/outputParser.test.ts`
  - Single test by name: `npx mocha --config .mocharc.yml --grep "<name>"`
- `npm run coverage`: nyc
- Packaging: `npx vsce package --target <win32-x64|linux-x64|darwin-arm64>`. VSIX files
  are platform-specific because the native deps are.
- Run/debug the extension: VS Code launch config "Run Extension" (compiles first).
  "Mocha Tests" debugs the unit tests.

Unit tests cover only pure logic (parsers, call stack, connection helpers). Anything that
imports `vscode` or the native packages can't run under plain mocha.

## Architecture

### Native backends (the big picture)

Platform packages are chosen at runtime as
`@tektronix/<name>-${process.platform}-${process.arch}` and listed under
`optionalDependencies`. When bumping a backend, update all three platform entries together.

- **kic-cli** (`src/kic-cli.ts`) exports `EXECUTABLE`, `DISCOVER_EXECUTABLE`, and
  `DEBUG_EXECUTABLE`.
  - `EXECUTABLE` is used as the `shellPath` of VS Code terminals (the instrument REPL) and
    is spawned for one-shot operations such as reset, abort, info, firmware update, and
    saving buffers (`src/connection.ts`). Code elsewhere recognizes the toolkit's own
    terminals by checking `shellPath === EXECUTABLE`.
  - `DISCOVER_EXECUTABLE` is spawned by `instrumentExplorer.ts`. It serves JSON-RPC on
    `http://localhost:3030/`, which `instrumentProvider.ts` polls to get discovered
    instruments.
  - `DEBUG_EXECUTABLE` is spawned by `tspRuntime.ts` for on-instrument debugging.
- **script-gen / trigger-flow** (`kic-script-gen-cli.ts`,
  `kic-script-trigger-flow-cli.ts`) are Rust processes that each host a local web server,
  which is shown in a webview panel. `BaseSessionManager` (`baseSessionManager.ts`) is the
  shared base: it spawns the child, waits for the server on its port, loads the webview,
  and relays webview messages (`WebviewCommandType`). `ScriptGenWebViewManager` and
  `TriggerFlowWebViewManager` subclass it. Their sessions are persisted through
  `genericSessionStorage.ts` and appear in the "Tools" tree
  (`combinedScriptGenDataProvider.ts`).
- **tsp-language-interop** is a native Node addon loaded with `require` in
  `tspConverter.ts`. It converts `.tsp` files into Python wrappers, and its diagnostics go
  to the Problems panel. Its types come from the dev dependency
  `@tektronix/tsp-language-interop-types`.

### Instruments and connections

- `InstrumentProvider` (a singleton tree data provider) merges instruments discovered over
  RPC with saved instruments from settings. `Instrument` (`instrument.ts`) owns one or
  more `Connection`s (`connection.ts`: LAN, VISA, and so on, each with a
  `ConnectionStatus`).
- Tree item `contextValue` strings (e.g. `Instr…Saved…Connected`, `CONN…Enabled…Active`)
  are matched by **regex `when` clauses in `package.json` menus**. If you rename a state
  or context string, update `package.json` too.
- `extension.ts` `activate()` registers most commands. `pickConnection()` and
  `getActiveConnection()` are the shared helpers for choosing a target connection.

### Language support

The extension depends on `sumneko.lua` (`extensionDependencies`) instead of shipping its
own language server. `workspaceManager.ts` writes `Lua.*` workspace settings (Lua 5.1
runtime, library paths). It uses `COMMAND_SETS` from
`@tektronix/keithley_instrument_libraries` and the `tsp.tspLinkSystemConfigurations`
setting (edited through `ConifgWebView.ts`, which is a misspelled filename) to generate
per-node Lua definitions, which gives completion and diagnostics for TSP-Link systems.
Hover and help docs come from `@tektronix/web-help-documents` (`helpDocumentWebView.ts`).

### Debugger

`activateTspDebug.ts` registers the `tspdebug` debug type → `TspDebugSession`
(`tspDebug.ts`, `@vscode/debugadapter`) → `TspRuntime` (`tspRuntime.ts`, which drives the
kic debug process). `debugResourceManager.ts`, `resourceManager.ts`, and `callStack.ts`
parse the debugger's XML/structured output.

### Misc

- Logging goes through `Log` in `logging.ts` with a `SourceLocation` (`{ file, func }`).
  Follow that pattern rather than using `console.log`.
- `dependencyChecker.ts` checks for platform prerequisites (VC++ redistributable, VISA) on
  Windows, Linux, and macOS.
- `scripts/link-dev-ki-comms.js` can `npm link` a local backend checkout for development
  against unreleased backends. `CONTRIBUTING.md` lists Node ≥ 20.11 and stable Rust as
  prerequisites for contributors who build those backends.

## Skills

This project's skills live in **`.agents/skills/`**, the vendor-neutral Agent Skills
location. Each subdirectory is one skill, following the
[Agent Skills specification](https://agentskills.io/specification): a `SKILL.md` with
`name` and `description` frontmatter, plus any supporting scripts or references.

```
.agents/skills/<skill-name>/SKILL.md
```

**Load skills from `.agents/skills/` regardless of whether your tool discovers that path
automatically.** Several agents read `.agents/skills/` natively; others only look in their
own namespaced directory (`.claude/skills/`, `.github/skills/`, `.gemini/skills/`,
`.opencode/skills/`, …). This repository deliberately keeps a single copy in the neutral
location rather than duplicating or symlinking it per vendor, so if your tool found no
skills on startup, list `.agents/skills/` and read the `SKILL.md` files yourself.

Before starting a task, check whether a skill already covers it. If one does, read its
`SKILL.md` and follow it instead of improvising an approach.

### Available skills

| Skill | Use it when |
| ----- | ----------- |
| [`changelog-entry`](.agents/skills/changelog-entry/SKILL.md) | Writing, updating, or refreshing the `CHANGELOG.md` entry or release notes for the current release branch. Covers this repo's committed and uncommitted changes plus the sub-project changelogs behind `@tektronix/*` version bumps. |

### Adding a skill

Create `.agents/skills/<skill-name>/SKILL.md`. The `name` in the frontmatter must match
the directory name, and the `description` should say both what the skill does and when to
use it — that sentence is all an agent sees when deciding whether the skill is relevant.
Keep `SKILL.md` focused; move long reference material into separate files the skill points
at, and put executable helpers in the skill's own directory so it stays self-contained.
