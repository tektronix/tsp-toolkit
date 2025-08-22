import { assert } from "chai"
import { suite, test } from "mocha"
import { setVariableErrorHandler } from "../debugResourceManager"

suite("Set Variable Error Parser Test Suite", function () {
    let setVarErrorParser: setVariableErrorHandler

    this.beforeAll(() => {
        setVarErrorParser = new setVariableErrorHandler()
    })

    test("Test Empty Input", function () {
        setVarErrorParser.checkForSetVarError("")
        assert.equal(setVarErrorParser.error_msg, "")
    })

    test("Test Full Error Tag", function () {
        const xml =
            "<SetVariable error ='[string &quot;return 10 + a...&quot;]:1: attempt to perform arithmetic on global `a&apos; (a boolean value)' />"
        setVarErrorParser.checkForSetVarError(xml)
        assert.equal(
            setVarErrorParser.error_msg,
            " attempt to perform arithmetic on global `a' (a boolean value)",
        )
    })

    test("Test Partial Error Tag", function () {
        const xml =
            "<SetVariable error ='[string &quot;return 10 + a...&quot;]:1: attempt to perform arithmetic on global"
        setVarErrorParser.checkForSetVarError(xml)
        assert.equal(setVarErrorParser.error_msg, "")
    })

    test("Test Full Error Tag In Parts", function () {
        const xml1 =
            "<SetVariable error ='[string &quot;return 10 + a...&quot;]:1: "
        const xml2 = "attempt to perform arithmetic on global "
        const xml3 = "`a&apos; (a boolean value)' />"

        const inputArr: string[] = []
        inputArr.push(xml1, xml2, xml3)
        inputArr.forEach((x) => {
            setVarErrorParser.checkForSetVarError(x)
        })
        assert.equal(
            setVarErrorParser.error_msg,
            " attempt to perform arithmetic on global `a' (a boolean value)",
        )
    })
})
