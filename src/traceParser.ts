import { StringDecoder } from "node:string_decoder"

export type TraceRecordHandler = (record: unknown) => void
export type TraceMalformedLineHandler = (line: string, error: Error) => void

/**
 * Parses newline-delimited JSON without relying on TCP read boundaries.
 *
 * Schema validation is intentionally left to the trace validation layer. This
 * parser only separates records and isolates malformed JSON lines.
 */
export class TraceJsonlParser {
    private readonly _decoder = new StringDecoder("utf8")
    private _buffer = ""

    constructor(
        private readonly _onRecord: TraceRecordHandler,
        private readonly _onMalformedLine: TraceMalformedLineHandler = () => {},
    ) {}

    push(chunk: Buffer | string): void {
        this._buffer += this._decoder.write(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
        )

        let newlineIndex = this._buffer.indexOf("\n")
        while (newlineIndex !== -1) {
            const line = this._buffer.slice(0, newlineIndex).replace(/\r$/, "")
            this._buffer = this._buffer.slice(newlineIndex + 1)
            this.parseLine(line)
            newlineIndex = this._buffer.indexOf("\n")
        }
    }

    finish(): void {
        this._buffer += this._decoder.end()
        if (this._buffer.length > 0) {
            this.parseLine(this._buffer)
            this._buffer = ""
        }
    }

    private parseLine(line: string): void {
        if (line.trim().length === 0) {
            return
        }

        try {
            this._onRecord(JSON.parse(line) as unknown)
        } catch (error) {
            this._onMalformedLine(
                line,
                error instanceof Error ? error : new Error(String(error)),
            )
        }
    }
}
