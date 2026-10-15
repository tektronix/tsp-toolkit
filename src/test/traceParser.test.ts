import { assert } from "chai"
import { suite, test } from "mocha"

import {
    MAX_TRACE_RECORD_BYTES,
    TraceEvent,
    TraceJsonlParser,
} from "../traceParser"

const validEvent: TraceEvent = {
    timestamp: "2026-10-15T13:00:00Z",
    session_id: "session-1",
    direction: "write",
    protocol: "lan",
    address: "127.0.0.1:5025",
    byte_length: 4,
    encoding: "utf8",
    data: "*IDN",
}

suite("TraceJsonlParser Test Suite", function () {
    test("parses split and coalesced JSON lines", function () {
        const records: unknown[] = []
        const parser = new TraceJsonlParser((record) => records.push(record))

        parser.push(
            `${JSON.stringify(validEvent)}\n${JSON.stringify(validEvent).slice(0, 20)}`,
        )
        parser.push(`${JSON.stringify(validEvent).slice(20)}\n`)

        assert.lengthOf(records, 2)
        assert.deepEqual(records[0], validEvent)
        assert.deepEqual(records[1], validEvent)
    })

    test("preserves UTF-8 when a multibyte character is split", function () {
        const event: TraceEvent = {
            ...validEvent,
            byte_length: 2,
            data: "µ",
        }
        const records: TraceEvent[] = []
        const parser = new TraceJsonlParser((record) => records.push(record))
        const encoded = Buffer.from(`${JSON.stringify(event)}\n`)
        const characterIndex = encoded.indexOf(Buffer.from("µ"))

        parser.push(encoded.subarray(0, characterIndex + 1))
        parser.push(encoded.subarray(characterIndex + 1))

        assert.deepEqual(records, [event])
    })

    test("delivers Base64 payload events", function () {
        const event: TraceEvent = {
            ...validEvent,
            direction: "read",
            protocol: "visa",
            encoding: "base64",
            byte_length: 3,
            data: "AP8Q",
        }
        const records: TraceEvent[] = []
        const parser = new TraceJsonlParser((record) => records.push(record))

        parser.push(`${JSON.stringify(event)}\n`)

        assert.deepEqual(records, [event])
    })

    test("isolates malformed lines and continues parsing", function () {
        const records: unknown[] = []
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            (record) => records.push(record),
            (line) => malformed.push(line),
        )

        parser.push(`{bad json}\n${JSON.stringify(validEvent)}\n`)

        assert.deepEqual(malformed, ["{bad json}"])
        assert.deepEqual(records, [validEvent])
    })

    test("contains record callback failures and continues parsing", function () {
        const records: TraceEvent[] = []
        const malformed: string[] = []
        let shouldFail = true
        const parser = new TraceJsonlParser(
            (record) => {
                if (shouldFail) {
                    shouldFail = false
                    throw new Error("display failure")
                }
                records.push(record)
            },
            (line) => malformed.push(line),
        )

        parser.push(
            `${JSON.stringify(validEvent)}\n${JSON.stringify(validEvent)}\n`,
        )

        assert.deepEqual(malformed, [JSON.stringify(validEvent)])
        assert.deepEqual(records, [validEvent])
    })

    test("isolates an incomplete record when the stream ends", function () {
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            () => {},
            (line) => malformed.push(line),
        )

        parser.push('{"session_id":')
        parser.finish()

        assert.deepEqual(malformed, ['{"session_id":'])
    })

    test("rejects invalid event fields", function () {
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            () => assert.fail("invalid event should not be delivered"),
            (line) => malformed.push(line),
        )

        parser.push(`${JSON.stringify({ ...validEvent, direction: "send" })}\n`)

        assert.lengthOf(malformed, 1)
    })

    test("bounds an unterminated trace record", function () {
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            () => assert.fail("oversized event should not be delivered"),
            (line) => malformed.push(line),
        )

        parser.push("x".repeat(MAX_TRACE_RECORD_BYTES + 1))
        parser.push(`${JSON.stringify(validEvent)}\n`)

        assert.deepEqual(malformed, ["[oversized trace record]"])
    })
})
