import { assert } from "chai"
import { suite, test } from "mocha"
import {
    buildBulkUpgradeSelectionItems,
    getEligibleConnectedMP5103Candidates,
    hasMultipleConnectedMP5103,
    parseMP5103SlotSelection,
    resolveSelectedCandidates,
    runConcurrentBulkFirmwareUpgrade,
} from "../bulkFirmwareUpgrade"

const CONNECTED_STATUS = 3

function buildMockInstrument(
    model: string,
    serialNumber: string,
    name: string,
    status: number,
    update: (filepath: string, slot?: number) => Promise<void>,
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
                update,
            },
        ],
    }
}

suite("Bulk Firmware Upgrade Test Suite", function () {
    test("Visibility gating uses connected MP5103 unique serial count", function () {
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

        const candidates = getEligibleConnectedMP5103Candidates(instruments)

        assert.equal(candidates.length, 2)
        assert.isTrue(hasMultipleConnectedMP5103(instruments))
    })

    test("Selection and shared-input helpers support subset/all and slot parsing", function () {
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

        const candidates = getEligibleConnectedMP5103Candidates(instruments)
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

        assert.isUndefined(parseMP5103SlotSelection("Mainframe"))
        assert.equal(parseMP5103SlotSelection("Slot 2"), 2)
        assert.isNull(parseMP5103SlotSelection("Invalid"))
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

        const candidates = getEligibleConnectedMP5103Candidates(instruments)
        const results = await runConcurrentBulkFirmwareUpgrade(
            candidates,
            "firmware.upg",
            1,
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
