import { assert } from "chai"
import { suite, test } from "mocha"
import * as dc from "../dependencyChecker"
/* // Test commented because is takes so long to run
suite("Dependency Checker Test Suite", function () {
    test("loop dependency check", async function () {
        const ITERATIONS = 5000
        let pass = 0
        let fail = 0
        for (let i = 0; i < ITERATIONS; i++) {
            console.error("####################")
            console.error(`### Attempt ${i} ###`)
            console.error("####################")
            const ok = (await dc.findMissingDependencies()).ok

            if (ok) {
                pass++
            } else {
                fail++
            }

            console.error("************************************************")
            console.error(
                `*** Attempt ${i}: ${ok ? "PASS" : "FAIL"} (P${pass}/F${fail}/T${ITERATIONS}) ***`,
            )
            console.error("************************************************")
        }

        console.error("========================")
        console.error(`=== PASS: ${pass} | FAIL: ${fail} ===`)
        console.error("========================")

        assert(pass == ITERATIONS, `dependency check ${fail} failed`)
    })
})

*/
