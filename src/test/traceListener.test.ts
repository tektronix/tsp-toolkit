import { once } from "node:events"
import * as net from "node:net"

import { assert } from "chai"
import { suite, test } from "mocha"

import { TraceListener } from "../traceListener"

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
})
