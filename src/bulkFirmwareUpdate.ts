import { ConnectionStatus } from "./connectionStatus"

export const MP5103_MODEL = "MP5103"
export const BULK_MP5103_CONTEXT_KEY = "tsp.hasMultipleAvailableMp5103"

/**
 * Connection statuses that make an instrument eligible for a bulk update, in
 * order of preference when an instrument has more than one eligible connection.
 */
const ELIGIBLE_STATUSES: readonly ConnectionStatus[] = [
    ConnectionStatus.Connected,
    ConnectionStatus.Connecting,
    ConnectionStatus.Active,
]

export interface BulkUpdateConnectionLike {
    addr: string
    updateInBackground(filepath: string, slot?: number): Promise<void>
}

export interface BulkUpdateInstrumentLike {
    name: string
    info: {
        model: string
        serial_number: string
    }
    connections: (BulkUpdateConnectionLike & {
        status: ConnectionStatus | undefined
    })[]
}

export interface BulkUpdateCandidate {
    serialNumber: string
    instrumentName: string
    label: string
    description: string
    connection: BulkUpdateConnectionLike
}

export interface BulkUpdateSelectionItem {
    id: string
    label: string
    description: string
}

export interface BulkUpdateResult {
    serialNumber: string
    instrumentName: string
    address: string
    /** The slot that was updated, or `undefined` for the mainframe. */
    slot: number | undefined
    success: boolean
    error?: string
}

export const MP5103_SLOTS: readonly number[] = [1, 2, 3]

/**
 * What to update on a single instrument: either the mainframe (`[undefined]`)
 * or one or more module slots.
 */
export interface BulkUpdateTarget {
    candidate: BulkUpdateCandidate
    slots: (number | undefined)[]
}

export interface BulkUpdateTargetItem {
    id: string
    serialNumber: string
    instrumentLabel: string
    /** The slot this item targets, or `undefined` for the mainframe. */
    slot: number | undefined
    label: string
    description: string
}

export type BulkUpdateTargetResolution =
    | { targets: BulkUpdateTarget[]; error?: undefined }
    | { targets?: undefined; error: string }

export function getEligibleMP5103Candidates(
    instruments: BulkUpdateInstrumentLike[],
): BulkUpdateCandidate[] {
    const dedupedBySerial = new Map<string, BulkUpdateCandidate>()

    for (const instrument of instruments) {
        if (instrument.info.model !== MP5103_MODEL) {
            continue
        }

        if (dedupedBySerial.has(instrument.info.serial_number)) {
            continue
        }

        const eligible = instrument.connections
            .filter(
                (connection) =>
                    connection.status !== undefined &&
                    ELIGIBLE_STATUSES.includes(connection.status),
            )
            .sort(
                (a, b) =>
                    ELIGIBLE_STATUSES.indexOf(a.status!) -
                    ELIGIBLE_STATUSES.indexOf(b.status!),
            )[0]

        if (!eligible) {
            continue
        }

        dedupedBySerial.set(instrument.info.serial_number, {
            serialNumber: instrument.info.serial_number,
            instrumentName: instrument.name,
            label: instrument.name,
            description: `${instrument.info.serial_number} @ ${eligible.addr}`,
            connection: eligible,
        })
    }

    return [...dedupedBySerial.values()]
}

export function hasMultipleAvailableMP5103(
    instruments: BulkUpdateInstrumentLike[],
): boolean {
    return getEligibleMP5103Candidates(instruments).length > 1
}

export function buildBulkUpdateSelectionItems(
    candidates: BulkUpdateCandidate[],
): BulkUpdateSelectionItem[] {
    return candidates.map((candidate) => ({
        id: candidate.serialNumber,
        label: candidate.label,
        description: candidate.description,
    }))
}

export function resolveSelectedCandidates(
    selectedIds: string[],
    candidates: BulkUpdateCandidate[],
): BulkUpdateCandidate[] {
    const selected = new Set(selectedIds)

    return candidates.filter((candidate) =>
        selected.has(candidate.serialNumber),
    )
}

export function slotLabel(slot: number | undefined): string {
    return slot === undefined ? "Mainframe" : `Slot ${slot}`
}

/**
 * Build one item for the mainframe and one for each slot of every candidate,
 * in candidate order.
 */
export function buildBulkUpdateTargetItems(
    candidates: BulkUpdateCandidate[],
): BulkUpdateTargetItem[] {
    return candidates.flatMap((candidate) =>
        [undefined, ...MP5103_SLOTS].map((slot) => ({
            id: `${candidate.serialNumber}:${slot ?? "mainframe"}`,
            serialNumber: candidate.serialNumber,
            instrumentLabel: candidate.label,
            slot,
            label: slotLabel(slot),
            description: candidate.label,
        })),
    )
}

/**
 * Enforce that mainframe and slot items are never selected together. The most
 * recently added item decides which kind is kept.
 */
export function enforceBulkUpdateTargetExclusivity<T>(
    previous: readonly T[],
    current: readonly T[],
    slotOf: (item: T) => number | undefined,
): T[] {
    const previousItems = new Set(previous)
    const added = current.filter((item) => !previousItems.has(item))

    if (added.length === 0) {
        return [...current]
    }

    const keepMainframe = slotOf(added[added.length - 1]) === undefined
    return current.filter(
        (item) => (slotOf(item) === undefined) === keepMainframe,
    )
}

/**
 * Turn the selected target item ids into per-instrument targets. Every
 * candidate must have either its mainframe or at least one slot selected, and
 * mainframe and slot selections cannot be mixed since they need different
 * firmware files.
 */
export function resolveBulkUpdateTargets(
    selectedIds: string[],
    candidates: BulkUpdateCandidate[],
): BulkUpdateTargetResolution {
    const selected = new Set(selectedIds)
    const items = buildBulkUpdateTargetItems(candidates).filter((item) =>
        selected.has(item.id),
    )

    const hasMainframe = items.some((item) => item.slot === undefined)
    const hasSlot = items.some((item) => item.slot !== undefined)
    if (hasMainframe && hasSlot) {
        return {
            error: "Select either mainframes or slots, not both.",
        }
    }

    const targets = candidates.map((candidate) => ({
        candidate,
        slots: items
            .filter((item) => item.serialNumber === candidate.serialNumber)
            .map((item) => item.slot),
    }))

    const missing = targets.filter((target) => target.slots.length === 0)
    if (missing.length > 0) {
        return {
            error: `Select the mainframe or at least one slot for: ${missing
                .map((target) => target.candidate.label)
                .join(", ")}`,
        }
    }

    return { targets }
}

/**
 * Update all targets. Instruments are updated concurrently, while the slots
 * of a single instrument are updated one at a time.
 */
export async function runConcurrentBulkFirmwareUpdate(
    targets: BulkUpdateTarget[],
    firmwarePath: string,
    onTargetDone?: (
        completed: number,
        total: number,
        result: BulkUpdateResult,
    ) => void,
): Promise<BulkUpdateResult[]> {
    let completed = 0
    const total = targets.reduce((sum, t) => sum + t.slots.length, 0)

    const perInstrument = await Promise.all(
        targets.map(async ({ candidate, slots }) => {
            const results: BulkUpdateResult[] = []

            for (const slot of slots) {
                let result: BulkUpdateResult

                try {
                    await candidate.connection.updateInBackground(
                        firmwarePath,
                        slot,
                    )

                    result = {
                        serialNumber: candidate.serialNumber,
                        instrumentName: candidate.instrumentName,
                        address: candidate.connection.addr,
                        slot,
                        success: true,
                    }
                } catch (error) {
                    result = {
                        serialNumber: candidate.serialNumber,
                        instrumentName: candidate.instrumentName,
                        address: candidate.connection.addr,
                        slot,
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }

                completed += 1
                onTargetDone?.(completed, total, result)
                results.push(result)
            }

            return results
        }),
    )

    return perInstrument.flat()
}
