import { assert } from "chai"
import { suite, test } from "mocha"
import { filterInstrumentsBySearch } from "../instrumentSearch"

interface InstrumentFixture {
    name: string
    model: string
    serialNumber: string
    addresses: string[]
    connections: { addr: string }[]
    connected: boolean
}

suite("Instrument Search Projection Test Suite", function () {
    test("filters active and offline projections without changing inventory objects", function () {
        const activeMatch: InstrumentFixture = {
            name: "Bench DMM",
            model: "2461",
            serialNumber: "ABC001",
            addresses: ["TCPIP0::192.168.1.20::INSTR"],
            connections: [
                { addr: "TCPIP0::192.168.1.20::INSTR" },
                { addr: "USB0::0x2461::1234::INSTR" },
            ],
            connected: true,
        }
        const activeNonMatch: InstrumentFixture = {
            name: "Other DMM",
            model: "2450",
            serialNumber: "XYZ002",
            addresses: [],
            connections: [],
            connected: true,
        }
        const offlineAddressMatch: InstrumentFixture = {
            name: "Stored DMM",
            model: "2450",
            serialNumber: "XYZ003",
            addresses: ["USB0::2461::1234::INSTR"],
            connections: [{ addr: "USB0::2461::1234::INSTR" }],
            connected: false,
        }
        const inventory = [activeMatch, activeNonMatch, offlineAddressMatch]

        const activeResults = filterInstrumentsBySearch(
            inventory.filter((instrument) => instrument.connected),
            "2461",
            (instrument) => instrument,
        )
        const offlineResults = filterInstrumentsBySearch(
            inventory.filter((instrument) => !instrument.connected),
            "2461",
            (instrument) => instrument,
        )

        assert.deepEqual(activeResults, [activeMatch])
        assert.strictEqual(activeResults[0], activeMatch)
        assert.strictEqual(
            activeResults[0].connections,
            activeMatch.connections,
        )
        assert.lengthOf(activeResults[0].connections, 2)
        assert.deepEqual(offlineResults, [offlineAddressMatch])
        assert.strictEqual(offlineResults[0], offlineAddressMatch)
        assert.deepEqual(inventory, [
            activeMatch,
            activeNonMatch,
            offlineAddressMatch,
        ])
        assert.isTrue(activeMatch.connected)

        offlineAddressMatch.connected = true
        assert.deepEqual(
            filterInstrumentsBySearch(
                inventory.filter((instrument) => instrument.connected),
                "2461",
                (instrument) => instrument,
            ),
            [activeMatch, offlineAddressMatch],
        )
        assert.deepEqual(
            filterInstrumentsBySearch(
                inventory.filter((instrument) => !instrument.connected),
                "2461",
                (instrument) => instrument,
            ),
            [],
        )
    })
})
