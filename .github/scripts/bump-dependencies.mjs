#!/usr/bin/env node
/**
 * Set the pinned version of one or more dependencies in `package.json`.
 *
 * This edits the file as text rather than going through `npm pkg set`, which
 * re-sorts every dependency block and would bury the real change in unrelated
 * reordering noise. Formatting, key order, and every untouched byte are preserved.
 *
 * Exits non-zero if a requested package is not already declared, so a typo in the
 * dependency name fails loudly instead of silently doing nothing.
 *
 * Usage:
 *   node bump-dependencies.mjs --manifest package.json \
 *                              --version 0.23.0 \
 *                              --packages '@tektronix/kic-cli-linux-x64,@tektronix/kic-cli-win32-x64'
 */

import { readFileSync, writeFileSync } from 'node:fs'

/** @returns {Record<string, string>} */
function parseArgs(argv) {
    const args = {}
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i]
        if (!key.startsWith('--')) {
            throw new Error(`Expected an option, got "${key}"`)
        }
        args[key.slice(2)] = argv[i + 1]
    }
    for (const required of ['manifest', 'version', 'packages']) {
        if (!args[required]) {
            throw new Error(`Missing required option --${required}`)
        }
    }
    return args
}

function escapeForRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    const version = args.version.trim()
    const packages = args.packages
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')

    if (packages.length === 0) {
        throw new Error('--packages did not contain any package names')
    }

    let manifest = readFileSync(args.manifest, 'utf8')
    const failures = []
    let changed = 0

    for (const name of packages) {
        const declaration = new RegExp(
            `("${escapeForRegExp(name)}"\\s*:\\s*")([^"]*)(")`,
            'g'
        )
        const matches = [...manifest.matchAll(declaration)]

        if (matches.length === 0) {
            failures.push(`"${name}" is not declared in ${args.manifest}`)
            continue
        }
        if (matches.length > 1) {
            failures.push(
                `"${name}" is declared ${matches.length} times in ${args.manifest}; refusing to guess`
            )
            continue
        }

        const [, , previous] = matches[0]
        if (previous === version) {
            console.log(`${name} is already ${version}`)
            continue
        }

        manifest = manifest.replace(declaration, `$1${version}$3`)
        changed++
        console.log(`${name}: ${previous} -> ${version}`)
    }

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error(`::error::${failure}`)
        }
        process.exit(1)
    }

    if (changed === 0) {
        console.log('Nothing to change.')
        return
    }

    writeFileSync(args.manifest, manifest)
}

main()
