import { assert } from "chai"
import { isVersionUpgrade } from "../version"

suite("Extension Test Suite", function () {
    test("recognizes an upgrade", function () {
        assert.isTrue(isVersionUpgrade("1.5.0", "1.5.1"))
    })

    test("does not recognize a downgrade as an upgrade", function () {
        assert.isFalse(isVersionUpgrade("1.5.1", "1.5.0"))
    })
})
