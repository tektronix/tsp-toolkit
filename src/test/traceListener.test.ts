import { once } from "node:events"
import * as net from "node:net"

import { assert } from "chai"
import { suite, test } from "mocha"

import { TraceListener } from "../traceListener"
import { formatTraceEvent } from "../traceFormatter"
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

    test("finishes an incomplete record when the socket disconnects", async function () {
        const malformed: string[] = []
        let resolveMalformed: () => void = () => {}
        const receivedMalformed = new Promise<void>((resolve) => {
            resolveMalformed = resolve
        })
        const listener = new TraceListener(
            () => {},
            (line) => {
                malformed.push(line)
                resolveMalformed()
            },
        )
        const address = await listener.start()
        const socket = net.createConnection(address.port, address.address)

        await once(socket, "connect")
        socket.end('{"session_id":')
        await receivedMalformed

        assert.deepEqual(malformed, ['{"session_id":'])
        await listener.dispose()
    })

    test("disposes the listening socket and supports multiple sessions", async function () {
        const records: TraceEvent[] = []
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
        const firstSocket = net.createConnection(address.port, address.address)
        const secondSocket = net.createConnection(address.port, address.address)

        await Promise.all([
            once(firstSocket, "connect"),
            once(secondSocket, "connect"),
        ])
        firstSocket.end(
            JSON.stringify({ ...validEvent, session_id: "session-1" }) + "\n",
        )
        secondSocket.end(
            JSON.stringify({ ...validEvent, session_id: "session-2" }) + "\n",
        )
        await receivedRecords

        assert.deepEqual(records.map((record) => record.session_id).sort(), [
            "session-1",
            "session-2",
        ])

        await listener.dispose()
        assert.isUndefined(listener.address)
    })

    test("isolates malformed input from another socket session", async function () {
        const records: TraceEvent[] = []
        let resolveRecord: () => void = () => {}
        const receivedRecord = new Promise<void>((resolve) => {
            resolveRecord = resolve
        })
        const listener = new TraceListener((record) => {
            records.push(record)
            resolveRecord()
        })
        const address = await listener.start()
        const malformedSocket = net.createConnection(
            address.port,
            address.address,
        )
        const validSocket = net.createConnection(address.port, address.address)

        await Promise.all([
            once(malformedSocket, "connect"),
            once(validSocket, "connect"),
        ])
        malformedSocket.end("{bad json}\n")
        validSocket.end(`${JSON.stringify(validEvent)}\n`)
        await receivedRecord

        assert.deepEqual(records, [validEvent])
        await listener.dispose()
    })

    test("consumes fake producer JSONL and formats correlated live output", async function () {
        const outputLines: string[] = []
        let resolveOutput: () => void = () => {}
        const receivedOutput = new Promise<void>((resolve) => {
            resolveOutput = resolve
        })
        const listener = new TraceListener((record) => {
            outputLines.push(formatTraceEvent(record))
            if (outputLines.length === 2) {
                resolveOutput()
            }
        })
        const address = await listener.start()
        const socket = net.createConnection(address.port, address.address)
        const firstEvent = { ...validEvent, session_id: "fake-session-1" }
        const secondEvent = {
            ...validEvent,
            session_id: "fake-session-2",
            direction: "read" as const,
            byte_length: 3,
            data: "ACK",
        }
        const firstLine = JSON.stringify(firstEvent) + "\n"
        const secondLine = JSON.stringify(secondEvent) + "\n"

        try {
            await once(socket, "connect")
            const splitIndex = Math.floor(firstLine.length / 2)
            socket.write(firstLine.slice(0, splitIndex))
            socket.write(firstLine.slice(splitIndex) + secondLine)
            await receivedOutput

            assert.deepEqual(
                outputLines.map((line) => line.split(/\s{2,}/)),
                [
                    [
                        "2026-10-15T13:00:00Z",
                        "fake-ses",
                        "WRITE",
                        "LAN",
                        "127.0.0.1:5025",
                        "4",
                        "UTF8",
                        '"*IDN"',
                    ],
                    [
                        "2026-10-15T13:00:00Z",
                        "fake-ses",
                        "READ",
                        "LAN",
                        "127.0.0.1:5025",
                        "3",
                        "UTF8",
                        '"ACK"',
                    ],
                ],
            )
        } finally {
            socket.destroy()
            await listener.dispose()
        }
    })
})
