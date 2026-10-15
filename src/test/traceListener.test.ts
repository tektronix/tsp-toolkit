import { once } from "node:events"
import * as net from "node:net"

import { assert } from "chai"
import { suite, test } from "mocha"

import { TraceListener } from "../traceListener"
import { TraceEvent } from "../traceParser"

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

suite("TraceListener Test Suite", function () {
    test("binds to an available localhost TCP port", async function () {
        const listener = new TraceListener()

        const address = await listener.start()

        assert.equal(address.address, "127.0.0.1")
        assert.isAbove(address.port, 0)
        assert.deepEqual(listener.address, address)

        await listener.dispose()
    })

    test("accepts a localhost connection before terminal startup", async function () {
        const listener = new TraceListener()
        const address = await listener.start()
        const socket = net.createConnection(address.port, address.address)

        await once(socket, "connect")
        assert.isTrue(socket.writable)

        socket.destroy()
        await listener.dispose()
    })

    test("passes socket records to the parser callback", async function () {
        const records: unknown[] = []
        let resolveRecords: () => void = () => {}
        const receivedRecords = new Promise<void>((resolve) => {
            resolveRecords = resolve
        })
        const listener = new TraceListener((record) => {
            records.push(record)
            if (records.length === 2) {
                resolveRecords()
            }
        })
        const address = await listener.start()
        const socket = net.createConnection(address.port, address.address)

        await once(socket, "connect")
        socket.write(
            `${JSON.stringify(validEvent)}\n${JSON.stringify(validEvent)}\n`,
        )
        await receivedRecords

        assert.deepEqual(records, [validEvent, validEvent])
        socket.destroy()
        await listener.dispose()
    })
})
