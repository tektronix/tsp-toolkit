import { assert } from "chai"
import { suite, test } from "mocha"

import { formatTraceEvent } from "../traceFormatter"
import { TraceEvent } from "../traceParser"

suite("Trace Formatter Test Suite", function () {
    test("formats trace metadata and payload for live display", function () {
        const event: TraceEvent = {
            timestamp: "2026-10-15T13:00:00Z",
            session_id: "session-1",
            direction: "write",
            protocol: "lan",
            address: "127.0.0.1:5025",
            byte_length: 4,
            encoding: "utf8",
            data: "*IDN",
        }

        assert.deepEqual(
            formatTraceEvent(event).split(/\s{2,}/),
            [
                "2026-10-15T13:00:00Z",
                "session-",
                "WRITE",
                "LAN",
                "127.0.0.1:5025",
                "4",
                "UTF8",
                '"*IDN"',
            ],
        )
    })

    test("formats missing addresses and Base64 payloads", function () {
        const event: TraceEvent = {
            timestamp: "2026-10-15T13:00:01Z",
            session_id: "session-2",
            direction: "read",
            protocol: "visa",
            address: null,
            byte_length: 3,
            encoding: "base64",
            data: "AP8Q",
        }

        assert.deepEqual(
            formatTraceEvent(event).split(/\s{2,}/),
            [
                "2026-10-15T13:00:01Z",
                "session-",
                "READ",
                "VISA",
                "<unknown>",
                "3",
                "BASE64",
                '"AP8Q"',
            ],
        )
    })

    test("truncates long session IDs and addresses for readable columns", function () {
        const event: TraceEvent = {
            timestamp: "2026-10-15T13:00:00Z",
            session_id: "12345678-90ab-cdef-1234-567890abcdef",
            direction: "write",
            protocol: "lan",
            address: "TCPIP::192.0.2.10::inst0::INSTR::extra-details",
            byte_length: 4,
            encoding: "utf8",
            data: "*IDN",
        }

        assert.deepEqual(
            formatTraceEvent(event).split(/\s{2,}/),
            [
                "2026-10-15T13:00:00Z",
                "12345678",
                "WRITE",
                "LAN",
                "TCPIP::192.0.2.10::inst0",
                "4",
                "UTF8",
                '"*IDN"',
            ],
        )
    })
})
