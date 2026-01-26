import { assert } from "chai"
import { suite, test } from "mocha"
import { ConnectionHelper } from "../resourceManager"

suite("ConnectionHelper Test Suite", function () {
    test("Correctly identify visa strings of the same type", function () {
        const samples: { a: string; b: string; expected: boolean }[] = [
            {
                a: "TCPIP0::domain.something.com::instr0::INSTR",
                b: "TCPIP0::127.0.0.1::instr0::INSTR",
                expected: true,
            },
            {
                a: "TCPIP0::domain.something.com::hislip0::INSTR",
                b: "TCPIP0::127.0.0.1::hislip0::INSTR",
                expected: true,
            },
            {
                a: "TCPIP0::127.0.0.1::instr0::INSTR",
                b: "TCPIP0::domain.something.com::hislip0::INSTR",
                expected: false,
            },
            {
                a: "TCPIP0::127.0.0.1::hislip0::INSTR",
                b: "TCPIP0::@127.0.0.1::5678::SOCKET",
                expected: false,
            },
            {
                a: "USB0::0x1234::0x1234::123456::INSTR",
                b: "TCPIP0::127.0.0.1::hislip0::INSTR",
                expected: false,
            },
        ]
        samples.forEach((e) => {
            assert(ConnectionHelper.AreSameVisaType(e.a, e.b) === e.expected)
        })
    })
})
