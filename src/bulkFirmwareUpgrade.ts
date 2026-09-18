export const MP5103_MODEL = "MP5103"
export const BULK_MP5103_CONTEXT_KEY = "tsp.hasMultipleConnectedMp5103"
const CONNECTED_STATUS = 3

export interface BulkUpgradeConnectionLike {
    addr: string
    update(filepath: string, slot?: number): Promise<void>
}

export interface BulkUpgradeInstrumentLike {
    name: string
    info: {
        model: string
        serial_number: string
    }
    connections: {
        status: number | undefined
        addr: string
        update(filepath: string, slot?: number): Promise<void>
    }[]
}

export interface BulkUpgradeCandidate {
    serialNumber: string
    instrumentName: string
    label: string
    description: string
    connection: BulkUpgradeConnectionLike
}

export interface BulkUpgradeSelectionItem {
    id: string
    label: string
    description: string
}

export interface BulkUpgradeResult {
    serialNumber: string
    instrumentName: string
    address: string
    success: boolean
    error?: string
}

export function getEligibleConnectedMP5103Candidates(
    instruments: BulkUpgradeInstrumentLike[],
): BulkUpgradeCandidate[] {
    const dedupedBySerial = new Map<string, BulkUpgradeCandidate>()

    for (const instrument of instruments) {
        if (instrument.info.model !== MP5103_MODEL) {
            continue
        }

        if (dedupedBySerial.has(instrument.info.serial_number)) {
            continue
        }

        const connected = instrument.connections.find(
            (connection) => connection.status === CONNECTED_STATUS,
        )

        if (!connected) {
            continue
        }

        dedupedBySerial.set(instrument.info.serial_number, {
            serialNumber: instrument.info.serial_number,
            instrumentName: instrument.name,
            label: instrument.name,
            description: `${instrument.info.serial_number} @ ${connected.addr}`,
            connection: connected,
        })
    }

    return [...dedupedBySerial.values()]
}

export function hasMultipleConnectedMP5103(
    instruments: BulkUpgradeInstrumentLike[],
): boolean {
    return getEligibleConnectedMP5103Candidates(instruments).length > 1
}

export function buildBulkUpgradeSelectionItems(
    candidates: BulkUpgradeCandidate[],
): BulkUpgradeSelectionItem[] {
    return candidates.map((candidate) => ({
        id: candidate.serialNumber,
        label: candidate.label,
        description: candidate.description,
    }))
}

export function resolveSelectedCandidates(
    selectedIds: string[],
    candidates: BulkUpgradeCandidate[],
): BulkUpgradeCandidate[] {
    const selected = new Set(selectedIds)

    return candidates.filter((candidate) =>
        selected.has(candidate.serialNumber),
    )
}

export function getMP5103SlotOptions(): string[] {
    return ["Mainframe", "Slot 1", "Slot 2", "Slot 3"]
}

export function parseMP5103SlotSelection(
    selectedOption: string | undefined,
): number | undefined | null {
    if (!selectedOption) {
        return null
    }

    if (selectedOption === "Mainframe") {
        return undefined
    }

    const match = /^Slot (\d+)$/.exec(selectedOption)
    if (!match) {
        return null
    }

    return Number.parseInt(match[1], 10)
}

export async function runConcurrentBulkFirmwareUpgrade(
    candidates: BulkUpgradeCandidate[],
    firmwarePath: string,
    slot: number | undefined,
    onCandidateDone?: (
        completed: number,
        total: number,
        result: BulkUpgradeResult,
    ) => void,
): Promise<BulkUpgradeResult[]> {
    let completed = 0
    const total = candidates.length

    return Promise.all(
        candidates.map(async (candidate): Promise<BulkUpgradeResult> => {
            let result: BulkUpgradeResult

            try {
                await candidate.connection.update(firmwarePath, slot)

                result = {
                    serialNumber: candidate.serialNumber,
                    instrumentName: candidate.instrumentName,
                    address: candidate.connection.addr,
                    success: true,
                }
            } catch (error) {
                result = {
                    serialNumber: candidate.serialNumber,
                    instrumentName: candidate.instrumentName,
                    address: candidate.connection.addr,
                    success: false,
                    error:
                        error instanceof Error ? error.message : String(error),
                }
            }

            completed += 1
            onCandidateDone?.(completed, total, result)

            return result
        }),
    )
}
