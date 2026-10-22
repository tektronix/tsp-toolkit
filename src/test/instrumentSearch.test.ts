import { assert } from "chai"
import { suite, test } from "mocha"
import {
    findUniqueExactInstrument,
    matchesInstrumentSearch,
} from "../instrumentSearch"

suite("Instrument Search Test Suite", function () {
    const instrument = {
        name: "Bench Supply",
        model: "2461-SYS",
        serialNumber: "12345678",
        manufacturer: "Keithley Instruments",
        addresses: [
            "192.168.1.42",
            "TCPIP0::192.168.1.42::inst0::INSTR",
            "USB0::0x05E6::0x2461::12345678::INSTR",
        ],
    }

    test("matches case-insensitive substrings in each instrument field", function () {
        for (const query of [
            "bench",
            "SUPPLY",
            "2461",
            "sys",
            "123456",
            "keithley",
            "INSTRUMENTS",
        ]) {
            assert.isTrue(matchesInstrumentSearch(instrument, query), query)
        }
    })

    test("matches IP and VISA address substrings", function () {
        for (const query of [
            "192.168.1",
            "TCPIP0::",
            "inst0::INSTR",
            "0x2461",
        ]) {
            assert.isTrue(matchesInstrumentSearch(instrument, query), query)
        }
    })

    test("trims queries and matches all instruments for blank input", function () {
        assert.isTrue(matchesInstrumentSearch(instrument, "  2461  "))
        assert.isTrue(matchesInstrumentSearch(instrument, ""))
        assert.isTrue(matchesInstrumentSearch(instrument, "   "))
    })

    test("handles missing fields and treats punctuation literally", function () {
        assert.isFalse(matchesInstrumentSearch({}, "2461"))
        assert.isTrue(
            matchesInstrumentSearch(
                { addresses: ["TCPIP0::192.168.1.42::INSTR"] },
                "192.168.1.42",
            ),
        )
        assert.isFalse(
            matchesInstrumentSearch({ model: "2461-SYS" }, "2461.SYS"),
        )
    })

    test("checks each address independently and rejects unrelated text", function () {
        assert.isTrue(
            matchesInstrumentSearch(
                { addresses: ["TCPIP0::", "USB0::0x05E6::0x2461::INSTR"] },
                "0x2461",
            ),
        )
        assert.isFalse(matchesInstrumentSearch(instrument, "unlisted-device"))
    })

    test("returns only a unique exact instrument match", function () {
        const one = { ...instrument, name: "2461", model: "2461" }
        const another = { ...instrument, serialNumber: "2461" }

        assert.strictEqual(
            findUniqueExactInstrument([one], " 2461 ", (item) => item),
            one,
        )
        assert.isUndefined(
            findUniqueExactInstrument([one, another], "2461", (item) => item),
        )
        assert.isUndefined(
            findUniqueExactInstrument([instrument], "2461", (item) => item),
        )
        assert.isUndefined(
            findUniqueExactInstrument([one], "   ", (item) => item),
        )
    })

    test("reveals one exact match despite other partial matches", function () {
        const exact = {
            name: "Keithley 2461",
            model: "2461",
            serialNumber: "ABC001",
            manufacturer: "Keithley",
            addresses: ["TCPIP0::192.168.1.42::INSTR"],
        }
        const partial = {
            name: "Bench 2461 Source",
            model: "2450",
            serialNumber: "ABC2461",
            manufacturer: "Keithley",
            addresses: [],
        }

        assert.strictEqual(
            findUniqueExactInstrument(
                [partial, exact],
                " 2461 ",
                (item) => item,
            ),
            exact,
        )
    })

    test("matches an exact connection address and deduplicates an instrument with multiple exact fields", function () {
        const exactAddress = {
            name: "Bench Meter",
            model: "2450",
            serialNumber: "ABC001",
            manufacturer: "Keithley",
            addresses: ["TCPIP0::bench::INSTR", "USB0::2461::ABC001::INSTR"],
        }

        assert.strictEqual(
            findUniqueExactInstrument(
                [exactAddress],
                "usb0::2461::abc001::instr",
                (item) => item,
            ),
            exactAddress,
        )
        assert.strictEqual(
            findUniqueExactInstrument(
                [{ ...exactAddress, name: "2461", model: "2461" }],
                "2461",
                (item) => item,
            )?.model,
            "2461",
        )
    })
})
