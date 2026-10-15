import { assert } from "chai"
import { suite, test } from "mocha"

import { TraceJsonlParser } from "../traceParser"

suite("TraceJsonlParser Test Suite", function () {
    test("parses split and coalesced JSON lines", function () {
        const records: unknown[] = []
        const parser = new TraceJsonlParser((record) => records.push(record))

        parser.push('{"id":1}\n{"id":')
        parser.push("2}\n")

        assert.deepEqual(records, [{ id: 1 }, { id: 2 }])
    })

    test("isolates malformed lines and continues parsing", function () {
        const records: unknown[] = []
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            (record) => records.push(record),
            (line) => malformed.push(line),
        )

        parser.push('{bad json}\n{"id":3}\n')

        assert.deepEqual(malformed, ["{bad json}"])
        assert.deepEqual(records, [{ id: 3 }])
    })

    test("isolates an incomplete record when the stream ends", function () {
        const malformed: string[] = []
        const parser = new TraceJsonlParser(
            () => {},
            (line) => malformed.push(line),
        )

        parser.push('{"id":')
        parser.finish()

        assert.deepEqual(malformed, ['{"id":'])
    })
})
