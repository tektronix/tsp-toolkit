import { TraceEvent } from "./traceParser"

const SESSION_ID_WIDTH = 8
const ADDRESS_WIDTH = 24
const TIMESTAMP_WIDTH = 23
const DIRECTION_WIDTH = 5
const PROTOCOL_WIDTH = 5
const BYTE_LENGTH_WIDTH = 6
const ENCODING_WIDTH = 7

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
        event.direction.toUpperCase().padEnd(DIRECTION_WIDTH),
        event.protocol.toUpperCase().padEnd(PROTOCOL_WIDTH),
        address.slice(0, ADDRESS_WIDTH).padEnd(ADDRESS_WIDTH),
        String(event.byte_length).padStart(BYTE_LENGTH_WIDTH),
        event.encoding.toUpperCase().padEnd(ENCODING_WIDTH),
        JSON.stringify(event.data),
    ].join("  ")
}

export function formatTraceHeader(): string {
    return [
        "TIMESTAMP".padEnd(TIMESTAMP_WIDTH),
        "SESSION".padEnd(SESSION_ID_WIDTH),
        "DIR".padEnd(DIRECTION_WIDTH),
        "PROTO".padEnd(PROTOCOL_WIDTH),
        "ADDRESS".padEnd(ADDRESS_WIDTH),
        "BYTES".padStart(BYTE_LENGTH_WIDTH),
        "ENCODING".padEnd(ENCODING_WIDTH),
        "PAYLOAD",
    ].join("  ")
}
