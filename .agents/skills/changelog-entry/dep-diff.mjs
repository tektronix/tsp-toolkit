#!/usr/bin/env node
// Compare @tektronix/* dependency versions between two package.json files.
//
// Usage: node dep-diff.mjs <old-package.json> <new-package.json>
//
// Platform-specific packages (…-win32-x64, …-linux-x64, …-darwin-arm64) and the
// …-types package are collapsed into a single sub-project "family" so each
// sub-project is reported once. Prints one line per changed family:
//
//   <family>  <old>  ->  <new>  [repo: tektronix/<repo>]  [base version changed|build only]

import { readFileSync } from 'node:fs'

const REPO_BY_FAMILY = {
    'kic-cli': 'tsp-toolkit-kic-cli',
    'script-gen': 'tsp-toolkit-script-gen',
    'trigger-flow': 'tsp-toolkit-trigger-flow',
    'tsp-language-interop': 'tsp-toolkit-language-interop',
    keithley_instrument_libraries: 'tsp-toolkit-webhelp-to-json',
    'web-help-documents': 'tsp-toolkit-webhelp',
}

const family = (name) =>
    name
        .replace(/^@tektronix\//, '')
        .replace(/-(win32-x64|linux-x64|darwin-arm64|types)$/, '')

/** Collapse all dependency blocks into { family: version } for @tektronix packages. */
function tekVersions(pkgPath) {
    const json = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const all = {
        ...json.dependencies,
        ...json.devDependencies,
        ...json.optionalDependencies,
    }
    const out = {}
    for (const [name, version] of Object.entries(all)) {
        if (!name.startsWith('@tektronix/')) continue
        // Some entries in package.json carry a stray leading space.
        out[family(name)] = String(version).trim()
    }
    return out
}

/** "0.23.0-11" -> "0.23.0" (the version a sub-project CHANGELOG heading uses). */
const baseVersion = (v) => (v ?? '').replace(/^[~^]/, '').split('-')[0]

const [oldPath, newPath] = process.argv.slice(2)
if (!oldPath || !newPath) {
    console.error('usage: node dep-diff.mjs <old-package.json> <new-package.json>')
    process.exit(2)
}

const before = tekVersions(oldPath)
const after = tekVersions(newPath)

let changed = 0
for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const from = before[key]
    const to = after[key]
    if (from === to) continue
    changed++
    const repo = REPO_BY_FAMILY[key] ?? '(unknown repo)'
    let kind
    if (!from) kind = 'new dependency'
    else if (!to) kind = 'dependency removed'
    else if (baseVersion(from) !== baseVersion(to)) kind = 'base version changed'
    else kind = 'build only'
    console.log(
        `${key}  ${from ?? '(absent)'}  ->  ${to ?? '(removed)'}  [repo: tektronix/${repo}]  [${kind}]`
    )
}

if (changed === 0) console.log('No @tektronix dependency version changes.')
