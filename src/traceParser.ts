import { StringDecoder } from "node:string_decoder"

/** Maximum size of one trace JSONL record, expressed as decimal 128 KB. */
export const MAX_TRACE_RECORD_BYTES = 128_000

export type TraceDirection = "read" | "write"
export type TraceProtocol = "lan" | "tls" | "visa"
export type TraceEncoding = "utf8" | "base64"

export interface TraceEvent {
    timestamp: string
    session_id: string
    direction: TraceDirection
    protocol: TraceProtocol
    address: string | null
    byte_length: number
    encoding: TraceEncoding
    data: string
}

export type TraceRecordHandler = (record: TraceEvent) => void
export type TraceMalformedLineHandler = (line: string, error: Error) => void

/**
 * Parses newline-delimited JSON without relying on TCP read boundaries.
 *
 * The parser validates the CLI event contract before delivering records and
 * isolates malformed or oversized JSON lines.
 */
export class TraceJsonlParser {
    private readonly _decoder = new StringDecoder("utf8")
    private _buffer = ""
    private _discardingOversizedLine = false

    constructor(
        private readonly _onRecord: TraceRecordHandler,
        private readonly _onMalformedLine: TraceMalformedLineHandler = () => {},
    ) {}

    push(chunk: Buffer | string): void {
        let decoded = this._decoder.write(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
        )

        if (this._discardingOversizedLine) {
            const newlineIndex = decoded.indexOf("\n")
            if (newlineIndex === -1) {
                return
            }

            this._discardingOversizedLine = false
            decoded = decoded.slice(newlineIndex + 1)
        }

        this._buffer += decoded

        let newlineIndex = this._buffer.indexOf("\n")
        while (newlineIndex !== -1) {
            const line = this._buffer.slice(0, newlineIndex).replace(/\r$/, "")
            this._buffer = this._buffer.slice(newlineIndex + 1)
            this.parseLine(line)
            newlineIndex = this._buffer.indexOf("\n")
        }

        if (
            this._buffer.length > 0 &&
            Buffer.byteLength(this._buffer, "utf8") > MAX_TRACE_RECORD_BYTES
        ) {
            this.reportMalformedLine(
                "[oversized trace record]",
                new Error(
                    `Trace record exceeds ${MAX_TRACE_RECORD_BYTES} bytes`,
                ),
            )
            this._buffer = ""
            this._discardingOversizedLine = true
        }
    }

    finish(): void {
        this._buffer += this._decoder.end()
        if (this._buffer.length > 0) {
            this.parseLine(this._buffer)
            this._buffer = ""
        }
        this._discardingOversizedLine = false
    }

    private parseLine(line: string): void {
        if (line.trim().length === 0) {
            return
        }

        if (Buffer.byteLength(line, "utf8") > MAX_TRACE_RECORD_BYTES) {
            this.reportMalformedLine(
                "[oversized trace record]",
                new Error(
                    `Trace record exceeds ${MAX_TRACE_RECORD_BYTES} bytes`,
                ),
            )
            return
        }

        try {
            this._onRecord(validateTraceEvent(JSON.parse(line) as unknown))
        } catch (error) {
            this.reportMalformedLine(
                line,
                error instanceof Error ? error : new Error(String(error)),
            )
        }
    }

    private reportMalformedLine(line: string, error: Error): void {
        this._onMalformedLine(line, error)
    }
}

export function validateTraceEvent(value: unknown): TraceEvent {
    if (!isRecord(value)) {
        throw new Error("Trace event must be a JSON object")
    }

    if (typeof value.timestamp !== "string" || value.timestamp.length === 0) {
        throw new Error("Trace event timestamp must be a non-empty string")
    }
    if (typeof value.session_id !== "string" || value.session_id.length === 0) {
        throw new Error("Trace event session_id must be a non-empty string")
    }
    if (!isTraceDirection(value.direction)) {
        throw new Error("Trace event direction is invalid")
    }
    if (!isTraceProtocol(value.protocol)) {
        throw new Error("Trace event protocol is invalid")
    }
    if (value.address !== null && typeof value.address !== "string") {
        throw new Error("Trace event address must be a string or null")
    }
    if (
        typeof value.byte_length !== "number" ||
        !Number.isSafeInteger(value.byte_length) ||
        value.byte_length < 0
    ) {
        throw new Error(
            "Trace event byte_length must be a non-negative integer",
        )
    }
    if (!isTraceEncoding(value.encoding)) {
        throw new Error("Trace event encoding is invalid")
    }
    if (typeof value.data !== "string") {
        throw new Error("Trace event data must be a string")
    }

    return {
        timestamp: value.timestamp,
        session_id: value.session_id,
        direction: value.direction,
        protocol: value.protocol,
        address: value.address,
        byte_length: value.byte_length,
        encoding: value.encoding,
        data: value.data,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTraceDirection(value: unknown): value is TraceDirection {
    return value === "read" || value === "write"
}

function isTraceProtocol(value: unknown): value is TraceProtocol {
    return value === "lan" || value === "tls" || value === "visa"
}

function isTraceEncoding(value: unknown): value is TraceEncoding {
    return value === "utf8" || value === "base64"
}
