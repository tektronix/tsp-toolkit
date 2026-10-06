import { assert } from "chai"
import { suite, test } from "mocha"
import {
    buildBulkUpgradeSelectionItems,
    buildBulkUpgradeTargetItems,
    enforceBulkUpgradeTargetExclusivity,
    getEligibleMP5103Candidates,
    hasMultipleAvailableMP5103,
    resolveBulkUpgradeTargets,
    resolveSelectedCandidates,
    runConcurrentBulkFirmwareUpgrade,
} from "../bulkFirmwareUpgrade"
import { ConnectionStatus } from "../connectionStatus"

const CONNECTED_STATUS = ConnectionStatus.Connected

function buildMockInstrument(
    model: string,
    serialNumber: string,
    name: string,
    status: ConnectionStatus | undefined,
    updateInBackground: (filepath: string, slot?: number) => Promise<void>,
) {
    return {
        name,
        info: {
            model,
            serial_number: serialNumber,
        },
        connections: [
            {
                status,
                addr: `${serialNumber}.addr`,
                updateInBackground,
            },
        ],
    }
}

suite("Bulk Firmware Upgrade Test Suite", function () {
    test("Visibility gating uses available MP5103 unique serial count", function () {
        const instruments = [
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "MP5103#SN-1",
                CONNECTED_STATUS,
                async () => {},
            ),
            // Duplicate serial should be ignored for eligibility count.
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "MP5103#SN-1-B",
                CONNECTED_STATUS,
                async () => {},
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "MP5103#SN-2",
                CONNECTED_STATUS,
                async () => {},
            ),
            buildMockInstrument(
                "TSPop",
                "SN-3",
                "TSPop#SN-3",
                CONNECTED_STATUS,
                async () => {},
            ),
        ]

        const candidates = getEligibleMP5103Candidates(instruments)

        assert.equal(candidates.length, 2)
        assert.isTrue(hasMultipleAvailableMP5103(instruments))
    })

    test("Active, Connecting, and Connected MP5103 instruments are eligible", function () {
        const instruments = [
            ConnectionStatus.Connected,
            ConnectionStatus.Connecting,
            ConnectionStatus.Active,
            ConnectionStatus.Inactive,
            ConnectionStatus.Ignored,
            undefined,
        ].map((status, i) =>
            buildMockInstrument(
                "MP5103",
                `SN-${i}`,
                `MP5103#SN-${i}`,
                status,
                async () => {},
            ),
        )

        const candidates = getEligibleMP5103Candidates(instruments)

        assert.deepEqual(
            candidates.map((c) => c.serialNumber),
            ["SN-0", "SN-1", "SN-2"],
        )
        assert.isTrue(hasMultipleAvailableMP5103(instruments))
    })

    test("A single available MP5103 does not enable bulk upgrade", function () {
        const instruments = [
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "MP5103#SN-1",
                ConnectionStatus.Active,
                async () => {},
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "MP5103#SN-2",
                ConnectionStatus.Inactive,
                async () => {},
            ),
        ]

        assert.isFalse(hasMultipleAvailableMP5103(instruments))
    })

    test("The highest-status connection is used for an instrument", function () {
        const instrument = buildMockInstrument(
            "MP5103",
            "SN-1",
            "MP5103#SN-1",
            ConnectionStatus.Active,
            async () => {},
        )
        instrument.connections.push(
            {
                status: ConnectionStatus.Connected,
                addr: "connected.addr",
                updateInBackground: async () => {},
            },
            {
                status: ConnectionStatus.Connecting,
                addr: "connecting.addr",
                updateInBackground: async () => {},
            },
        )

        const candidates = getEligibleMP5103Candidates([instrument])

        assert.equal(candidates.length, 1)
        assert.equal(candidates[0].connection.addr, "connected.addr")
    })

    test("Selection helpers support subset/all", function () {
        const instruments = [
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "MP5103#SN-1",
                CONNECTED_STATUS,
                async () => {},
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "MP5103#SN-2",
                CONNECTED_STATUS,
                async () => {},
            ),
        ]

        const candidates = getEligibleMP5103Candidates(instruments)
        const items = buildBulkUpgradeSelectionItems(candidates)
        const allIds = items.map((item) => item.id)

        const allSelection = resolveSelectedCandidates(allIds, candidates)
        const subsetSelection = resolveSelectedCandidates(["SN-2"], candidates)
        const cancelBeforeDispatchSelection = resolveSelectedCandidates(
            [],
            candidates,
        )

        assert.equal(allSelection.length, 2)
        assert.equal(subsetSelection.length, 1)
        assert.equal(subsetSelection[0].serialNumber, "SN-2")
        assert.equal(cancelBeforeDispatchSelection.length, 0)
    })

    test("Target items include the mainframe and every slot per instrument", function () {
        const candidates = getEligibleMP5103Candidates([
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "A",
                CONNECTED_STATUS,
                async () => {},
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "B",
                CONNECTED_STATUS,
                async () => {},
            ),
        ])

        const items = buildBulkUpgradeTargetItems(candidates)

        assert.deepEqual(
            items.map((item) => [item.serialNumber, item.slot, item.label]),
            [
                ["SN-1", undefined, "Mainframe"],
                ["SN-1", 1, "Slot 1"],
                ["SN-1", 2, "Slot 2"],
                ["SN-1", 3, "Slot 3"],
                ["SN-2", undefined, "Mainframe"],
                ["SN-2", 1, "Slot 1"],
                ["SN-2", 2, "Slot 2"],
                ["SN-2", 3, "Slot 3"],
            ],
        )
        assert.equal(new Set(items.map((item) => item.id)).size, items.length)
    })

    test("Target resolution allows different slots per instrument", function () {
        const candidates = getEligibleMP5103Candidates([
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "A",
                CONNECTED_STATUS,
                async () => {},
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "B",
                CONNECTED_STATUS,
                async () => {},
            ),
        ])
        const id = (serial: string, slot: number | undefined) =>
            buildBulkUpgradeTargetItems(candidates).find(
                (item) => item.serialNumber === serial && item.slot === slot,
            )!.id

        const slots = resolveBulkUpgradeTargets(
            [id("SN-1", 1), id("SN-1", 3), id("SN-2", 2)],
            candidates,
        )
        assert.isUndefined(slots.error)
        assert.deepEqual(
            slots.targets?.map((t) => [t.candidate.serialNumber, t.slots]),
            [
                ["SN-1", [1, 3]],
                ["SN-2", [2]],
            ],
        )

        const mainframes = resolveBulkUpgradeTargets(
            [id("SN-1", undefined), id("SN-2", undefined)],
            candidates,
        )
        assert.deepEqual(
            mainframes.targets?.map((t) => t.slots),
            [[undefined], [undefined]],
        )

        const mixed = resolveBulkUpgradeTargets(
            [id("SN-1", undefined), id("SN-2", 1)],
            candidates,
        )
        assert.isString(mixed.error)

        const missing = resolveBulkUpgradeTargets([id("SN-1", 2)], candidates)
        assert.include(missing.error, "B")
    })

    test("Mainframe and slot selections are mutually exclusive", function () {
        const mainframe = { slot: undefined }
        const slot1 = { slot: 1 }
        const slot2 = { slot: 2 }
        const slotOf = (item: { slot: number | undefined }) => item.slot

        assert.deepEqual(
            enforceBulkUpgradeTargetExclusivity(
                [slot1, slot2],
                [slot1, slot2, mainframe],
                slotOf,
            ),
            [mainframe],
        )
        assert.deepEqual(
            enforceBulkUpgradeTargetExclusivity(
                [mainframe],
                [mainframe, slot1],
                slotOf,
            ),
            [slot1],
        )
        assert.deepEqual(
            enforceBulkUpgradeTargetExclusivity(
                [slot1, slot2],
                [slot2],
                slotOf,
            ),
            [slot2],
        )
    })

    test("Slots on one instrument upgrade sequentially", async function () {
        const order: string[] = []
        let running = 0
        let maxRunning = 0
        const upgrade = async (_path: string, slot?: number) => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            order.push(`start ${slot}`)
            await new Promise((resolve) => setTimeout(resolve, 10))
            order.push(`end ${slot}`)
            running -= 1
        }

        const [candidate] = getEligibleMP5103Candidates([
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "A",
                CONNECTED_STATUS,
                upgrade,
            ),
        ])

        const progress: [number, number][] = []
        const results = await runConcurrentBulkFirmwareUpgrade(
            [{ candidate, slots: [1, 3] }],
            "firmware.upg",
            (completed, total) => progress.push([completed, total]),
        )

        assert.equal(maxRunning, 1)
        assert.deepEqual(order, ["start 1", "end 1", "start 3", "end 3"])
        assert.deepEqual(
            results.map((r) => r.slot),
            [1, 3],
        )
        assert.deepEqual(progress, [
            [1, 2],
            [2, 2],
        ])
    })

    test("Concurrent dispatch runs all targets once and captures failures without retry", async function () {
        const callCount = new Map<string, number>()
        let running = 0
        let maxRunning = 0

        const createUpgrade = (serial: string, shouldFail: boolean) => {
            return async () => {
                callCount.set(serial, (callCount.get(serial) ?? 0) + 1)
                running += 1
                maxRunning = Math.max(maxRunning, running)

                await new Promise<void>((resolve, reject) => {
                    setTimeout(() => {
                        running -= 1
                        if (shouldFail) {
                            reject(new Error("upgrade failed"))
                            return
                        }
                        resolve()
                    }, 30)
                })
            }
        }

        const instruments = [
            buildMockInstrument(
                "MP5103",
                "SN-1",
                "MP5103#SN-1",
                CONNECTED_STATUS,
                createUpgrade("SN-1", false),
            ),
            buildMockInstrument(
                "MP5103",
                "SN-2",
                "MP5103#SN-2",
                CONNECTED_STATUS,
                createUpgrade("SN-2", true),
            ),
            buildMockInstrument(
                "MP5103",
                "SN-3",
                "MP5103#SN-3",
                CONNECTED_STATUS,
                createUpgrade("SN-3", false),
            ),
        ]

        const candidates = getEligibleMP5103Candidates(instruments)
        const results = await runConcurrentBulkFirmwareUpgrade(
            candidates.map((candidate) => ({ candidate, slots: [1] })),
            "firmware.upg",
        )

        assert.isAbove(maxRunning, 1)
        assert.equal(callCount.get("SN-1"), 1)
        assert.equal(callCount.get("SN-2"), 1)
        assert.equal(callCount.get("SN-3"), 1)

        const failed = results.filter((result) => !result.success)
        assert.equal(failed.length, 1)
        assert.equal(failed[0].serialNumber, "SN-2")
    })
})
