export interface InstrumentSearchFields {
    name?: string
    model?: string
    serialNumber?: string
    manufacturer?: string
    addresses?: readonly string[]
}

export function matchesInstrumentSearch(
    instrument: InstrumentSearchFields,
    query: string,
): boolean {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
        return true
    }

    return [
        instrument.name,
        instrument.model,
        instrument.serialNumber,
        instrument.manufacturer,
        ...(instrument.addresses ?? []),
    ].some((value) => value?.toLowerCase().includes(normalizedQuery) ?? false)
}

export function filterInstrumentsBySearch<T>(
    instruments: readonly T[],
    query: string,
    getFields: (instrument: T) => InstrumentSearchFields,
): T[] {
    return instruments.filter((instrument) =>
        matchesInstrumentSearch(getFields(instrument), query),
    )
}

export function findUniqueExactInstrument<T>(
    instruments: readonly T[],
    query: string,
    getFields: (instrument: T) => InstrumentSearchFields,
): T | undefined {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
        return undefined
    }

    let exactMatch: T | undefined
    const examined = new Set<T>()
    for (const instrument of instruments) {
        if (examined.has(instrument)) {
            continue
        }
        examined.add(instrument)
        const fields = getFields(instrument)
        const values = [
            fields.name,
            fields.model,
            fields.serialNumber,
            fields.manufacturer,
            ...(fields.addresses ?? []),
        ]
        if (
            values.some(
                (value) => value?.trim().toLowerCase() === normalizedQuery,
            )
        ) {
            if (exactMatch !== undefined) {
                return undefined
            }
            exactMatch = instrument
        }
    }
    return exactMatch
}
