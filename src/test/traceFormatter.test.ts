import { assert } from "chai"
import { suite, test } from "mocha"

import {
    formatTraceEvent,
    formatTraceHeader,
    formatTraceLifecycleEvent,
} from "../traceFormatter"
import { TraceEvent, TraceLifecycleEvent } from "../traceParser"

suite("Trace Formatter Test Suite", function () {
    test("formats trace metadata and payload for live display", function () {
        const event: TraceEvent = {
            timestamp: "2026-10-15T13:00:00.123456789Z",
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
                "2026-10-15T13:00:00.123",
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
            timestamp: "2026-10-15T13:00:01.987654321Z",
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
                "2026-10-15T13:00:01.987",
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

    test("formats connection lifecycle events without payload metadata", function () {
        const event: TraceLifecycleEvent = {
            event: "connection_closed",
            timestamp: "2026-10-15T13:00:01.987654321Z",
            session_id: "session-2",
            protocol: "visa",
            address: null,
            reason: "eof",
        }

        assert.deepEqual(
            formatTraceLifecycleEvent(event).split(/\s{2,}/),
            [
                "2026-10-15T13:00:01.987",
                "session-",
                "CLOSE",
                "VISA",
                "<unknown>",
                '"eof"',
            ],
        )
    })

    test("truncates long session IDs and addresses for readable columns", function () {
        const event: TraceEvent = {
            timestamp: "2026-10-15T13:00:00.123456789Z",
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
                "2026-10-15T13:00:00.123",
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

    test("preserves invalid timestamps for diagnostics", function () {
        const event: TraceEvent = {
            timestamp: "not-a-timestamp",
            session_id: "session-3",
            direction: "read",
            protocol: "lan",
            address: null,
            byte_length: 0,
            encoding: "utf8",
            data: "",
        }

        assert.include(formatTraceEvent(event), "not-a-timestamp")
    })

    test("aligns column headings with formatted trace fields", function () {
        assert.deepEqual(formatTraceHeader().split(/\s{2,}/), [
            "TIMESTAMP",
            "SESSION",
            "DIR",
            "PROTO",
            "ADDRESS",
            "BYTES",
            "ENCODING",
            "PAYLOAD",
        ])
    })
})
