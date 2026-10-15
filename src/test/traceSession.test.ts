import { assert } from "chai"
import { suite, test } from "mocha"

import { buildTraceCliArguments, createTraceSessionId } from "../traceSession"

suite("Trace Session Test Suite", function () {
    test("creates unique UUID session identifiers", function () {
        const firstSessionId = createTraceSessionId()
        const secondSessionId = createTraceSessionId()

        assert.notEqual(firstSessionId, secondSessionId)
        assert.match(
            firstSessionId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        )
        assert.match(
            secondSessionId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        )
    })

    test("builds the trace CLI arguments in contract order", function () {
        assert.deepEqual(
            buildTraceCliArguments(
                { address: "127.0.0.1", family: "IPv4", port: 43210 },
                "session-1",
            ),
            [
                "--trace-socket",
                "127.0.0.1:43210",
                "--trace-session-id",
                "session-1",
            ],
        )
    })
})
