import { TraceEvent } from "./traceParser"

const SESSION_ID_WIDTH = 8
const ADDRESS_WIDTH = 24

function formatTraceTimestamp(timestamp: string): string {
    const parsed = new Date(timestamp)
    return Number.isNaN(parsed.getTime())
        ? timestamp
        : parsed.toISOString().slice(0, 23)
}

export function formatTraceEvent(event: TraceEvent): string {
    const sessionId = event.session_id.slice(0, SESSION_ID_WIDTH)
    const address = event.address ?? "<unknown>"

    return [
        formatTraceTimestamp(event.timestamp),
        sessionId.padEnd(SESSION_ID_WIDTH),
        event.direction.toUpperCase().padEnd(5),
        event.protocol.toUpperCase().padEnd(5),
        address.slice(0, ADDRESS_WIDTH).padEnd(ADDRESS_WIDTH),
        String(event.byte_length).padStart(6),
        event.encoding.toUpperCase().padEnd(7),
        JSON.stringify(event.data),
    ].join("  ")
}
