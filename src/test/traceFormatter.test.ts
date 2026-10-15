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

        assert.equal(
            formatTraceEvent(event),
            '2026-10-15T13:00:00Z session=session-1 WRITE lan address=127.0.0.1:5025 bytes=4 encoding=utf8 data="*IDN"',
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

        assert.equal(
            formatTraceEvent(event),
            '2026-10-15T13:00:01Z session=session-2 READ visa address=<unknown> bytes=3 encoding=base64 data="AP8Q"',
        )
    })
})
