#!/usr/bin/env node
/**
 * Fold the changelog entries of an upstream dependency into this repository's
 * `CHANGELOG.md`.
 *
 * Entries are added to the newest (top-most) `## [x.y.z]` section, under the same
 * `### Added` / `### Changed` / `### Fixed` heading they had upstream, and are
 * prefixed with the upstream repository name so their origin stays obvious:
 *
 *     ### Changed
 *     - **tsp-toolkit-kic-cli** - Run LAN and VISA discovery in parallel
 *
 * Re-running with entries that are already present is a no-op, so repeated bumps
 * of the same dependency do not duplicate lines.
 *
 * Usage:
 *   node merge-changelog.mjs --target CHANGELOG.md \
 *                            --entries entries.md \
 *                            --source tsp-toolkit-kic-cli
 */

import { readFileSync, writeFileSync } from 'node:fs'

const VERSION_HEADING = /^## +\[/
const GROUP_HEADING = /^### +(.+?)\s*$/
const ITEM = /^[-*] +/

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
    for (const required of ['target', 'entries', 'source']) {
        if (!args[required]) {
            throw new Error(`Missing required option --${required}`)
        }
    }
    return args
}

/**
 * Split changelog text into `### `-delimited groups of list items. Items that wrap
 * onto following lines are joined back onto a single line.
 *
 * @returns {Map<string, string[]>} group heading -> item text (without the bullet)
 */
function parseGroups(text) {
    const groups = new Map()
    let group = null
    let items = null

    for (const line of text.split(/\r?\n/)) {
        const heading = line.match(GROUP_HEADING)
        if (heading) {
            group = heading[1]
            items = groups.get(group) ?? []
            groups.set(group, items)
            continue
        }
        if (group === null) {
            // Items before the first `### ` heading have no category to map onto.
            continue
        }
        if (ITEM.test(line)) {
            items.push(line.replace(ITEM, '').trim())
        } else if (line.trim() !== '' && items.length > 0) {
            items[items.length - 1] += ` ${line.trim()}`
        }
    }

    for (const [name, groupItems] of groups) {
        if (groupItems.length === 0) {
            groups.delete(name)
        }
    }
    return groups
}

/**
 * Locate the newest version section. Returns the index of its heading and the
 * index one past its last non-blank line.
 */
function findNewestSection(lines) {
    const start = lines.findIndex((line) => VERSION_HEADING.test(line))
    if (start === -1) {
        throw new Error('No "## [x.y.z]" section found in the target changelog')
    }

    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
        if (VERSION_HEADING.test(lines[i])) {
            end = i
            break
        }
    }
    // Leave any blank separator lines before the next section untouched.
    while (end > start + 1 && lines[end - 1].trim() === '') {
        end--
    }
    return { start, end }
}

/** Split a section body into a preamble plus its `### ` groups, preserving order. */
function splitSection(body) {
    const preamble = []
    const groups = []

    for (const line of body) {
        const heading = line.match(GROUP_HEADING)
        if (heading) {
            groups.push({ name: heading[1], heading: line, lines: [] })
        } else if (groups.length === 0) {
            preamble.push(line)
        } else {
            groups[groups.length - 1].lines.push(line)
        }
    }
    return { preamble, groups }
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    const incoming = parseGroups(readFileSync(args.entries, 'utf8'))

    if (incoming.size === 0) {
        console.log('No upstream changelog entries to merge.')
        return
    }

    const original = readFileSync(args.target, 'utf8')
    const newline = original.includes('\r\n') ? '\r\n' : '\n'
    const lines = original.split(/\r?\n/)

    const { start, end } = findNewestSection(lines)
    const section = splitSection(lines.slice(start + 1, end))
    const existing = new Set(
        lines.slice(start + 1, end).map((line) => line.trim())
    )

    let added = 0
    for (const [name, items] of incoming) {
        const entries = items
            .map((item) => `- **${args.source}** - ${item}`)
            .filter((entry) => !existing.has(entry))

        if (entries.length === 0) {
            continue
        }
        added += entries.length

        let group = section.groups.find((candidate) => candidate.name === name)
        if (!group) {
            group = { name, heading: `### ${name}`, lines: [] }
            section.groups.push(group)
        }
        // Append after the group's last item, ignoring trailing blank lines.
        while (group.lines.length > 0 && group.lines.at(-1).trim() === '') {
            group.lines.pop()
        }
        group.lines.push(...entries)
    }

    if (added === 0) {
        console.log(
            `All ${args.source} entries are already in ${lines[start]}; nothing to do.`
        )
        return
    }

    const body = [...section.preamble]
    for (const group of section.groups) {
        body.push(group.heading, ...group.lines)
    }

    const merged = [
        ...lines.slice(0, start + 1),
        ...body,
        ...lines.slice(end),
    ].join(newline)

    writeFileSync(args.target, merged)
    console.log(`Merged ${added} ${args.source} entry/entries into ${lines[start]}.`)
}

main()
