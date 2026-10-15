import { TraceEvent } from "./traceParser"

export function formatTraceEvent(event: TraceEvent): string {
    const address = event.address ?? "<unknown>"
    return `${event.timestamp} session=${event.session_id} ${event.direction.toUpperCase()} ${event.protocol} address=${address} bytes=${event.byte_length} encoding=${event.encoding} data=${JSON.stringify(event.data)}`
}
