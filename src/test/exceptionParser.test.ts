import { assert } from "chai"
import { suite, test } from "mocha"
import { RuntimeExceptionHandler } from "../debugResourceManager"

suite("Exception Parser Test Suite", function () {
    let testExceptionParser: RuntimeExceptionHandler

    this.beforeAll(() => {
        testExceptionParser = new RuntimeExceptionHandler()
    })

    test("Test Empty Input", function () {
        testExceptionParser.checkForException("")
        assert.equal(testExceptionParser.exceptionInfo, "")
    })

    test("Test Full Exception Tag", function () {
        const xml =
            "<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_tspScript&quot;]:4:attempt to perform arithmetic on a nil value&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:4: in function `fun2&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:12: in function `fun1&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:15: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:897: in function &lt;[string &quot;&quot;]:897&gt;&#x240a;&#x2409;[C]: in function `xpcall&apos;&#x240a;&#x2409;[string &quot;&quot;]:897: in function `kiExecuteWithDebugger&apos;&#x240a;&#x2409;[string &quot;&quot;]:1: in main chunk&#x240a;' name='debug_kic_tspScript' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>"
        testExceptionParser.checkForException(xml)
        assert.isTrue(
            testExceptionParser.exceptionInfo.includes(
                "attempt to perform arithmetic on a nil value"
            )
        )

        assert.equal(
            testExceptionParser.exceptnInfoForUI.Description,
            "attempt to perform arithmetic on a nil value"
        )
        assert.equal(testExceptionParser.exceptnInfoForUI.StackTrace.length, 3)
    })

    test("Test Partial Exception Tag", function () {
        const xml =
            "<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_tspScript&quot;]:4:attempt to perform arithmetic on a nil value&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:4: in function `fun2&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:12: in function `fun1&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:15: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:897: in function &lt;[string &quot;&quot;]:897&gt;&#x240a;&#x2409;[C]: "
        testExceptionParser.checkForException(xml)
        assert.equal(testExceptionParser.exceptionInfo, "")
        // since we didn't get next chunck of exception, because of any reason, so, need to restart the debugger
        // with new RuntimeExceptionHandler
        testExceptionParser = new RuntimeExceptionHandler()
    })

    suite("Test Exception Parser with chunks of exception data", function () {
        test("Exception in chuncks", function () {
            const stackOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_c

allStacks&quot;]:21:bad argument #1 to "insert&ap

os; (table expected, got string)\n;stack trackback:\n;    ;(tail ca

ll): ?\n;    ;[C]: in function "insert&apos;\n;    ;[string &quot;debug_kic_callStacks

&quot;]:21: in main chunk\n;    ;[string &quot;&quot;]:950: in function &lt;[string &quot;&quo

t;]:950&gt;\n;    ;[C]: in function "xpcall&apos;\n;    ;[string &quot;&quot;]:950: in function "kiExecute

WithDebugger&apos;\n;    ;[string &quot;&quot;]:1: in main chunk\n;' name='debug_kic_callSt

acks' /></tspdbg-AA4E9540-A46C-467

1-81D7-4FE69A9B6DC4>`
            let exceptionArr: string[] = []
            exceptionArr = stackOutput.split("\n\n")
            exceptionArr.forEach((element) => {
                testExceptionParser.checkForException(element)
            })
            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace.length,
                1
            )
            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].Level,
                "0"
            )

            assert.isTrue(
                testExceptionParser.exceptnInfoForUI.Description.includes(
                    "bad argument"
                )
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].CurrLine,
                "21"
            )
        })

        test("Multi-Calling Functions Exception", function () {
            const stackOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_errorTSP&quot;]:4:attempt to call global "xpall&apos; (a nil value)&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:4: in function &lt;[string &quot;debug_kic_errorTSP&quot;]:1&gt;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:9: in function &lt;[string &quot;debug_kic_errorTSP&quot;]:7&gt;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:1

5: in function "first&apos;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:18: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:950: in function &lt;[string &quot;&quot;]:950&gt;&#x240a;&#x2409;[C]: in function "xpcall&apos;&#x240a;&#x2409;[string &quot;&quot;]:950: in function "kiExecuteWithDebugger&apos;&#x240a;&#x2409;[string &quot;&quot;]:1: in main chunk&#x240a;' name='debug_kic_errorTSP' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-en`
            let exceptionArr: string[] = []
            exceptionArr = stackOutput.split("\n\n")
            exceptionArr.forEach((element) => {
                testExceptionParser.checkForException(element)
            })

            assert.isTrue(
                testExceptionParser.exceptnInfoForUI.Description.includes(
                    "attempt to call global"
                )
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace.length,
                4
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].Level,
                "0"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[1].Level,
                "1"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[2].Level,
                "2"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[3].Level,
                "3"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].CurrLine,
                "4"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[2].Level,
                "2"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[3].CurrLine,
                "18"
            )
        })

        test("Multi-Calling Functions Inbuild-Exception", function () {
            const stackOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-fai

led error='[string &quot;debug_kic_errorTSP&quot;]:4:bad argument #2 to "xpcall&apos; (va

lue expected)&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[C]: in f

unction "xpcall&apos;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:4: in function &lt;[string &

quot;debug_kic_errorTSP&quot;]:1&gt;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;]:9: in fu

nction &lt;[string &quot;debug_kic_errorTSP&quot;]:7&gt;&#x240a;&#x2409;[string &quot;debug_kic_errorTSP&quot;

]:15: in function "first&apos;&#x240a;&#x24

09;[string &quot;debug_kic_errorTSP&quot;]:18: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:950: i

n function &lt;[string &quot;&quot;]:950&gt;&#x240a;&#x2409;[C]: in function "xpcall&apos;&#x240a;&#x2409;[

string &quot;&quot;]:950: in function "kiExecuteWithDebugger&apos;&#x240a;&#x2409;[string &quot

;&quot;]:1: in main chunk&#x240a;' name='debug_kic_errorTSP' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>`
            let exceptionArr: string[] = []
            exceptionArr = stackOutput.split("\n\n")
            exceptionArr.forEach((element) => {
                testExceptionParser.checkForException(element)
            })
            assert.isTrue(
                testExceptionParser.exceptnInfoForUI.Description.includes(
                    "xpcall"
                )
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace.length,
                4
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].Level,
                "0"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[1].Level,
                "1"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[2].Level,
                "2"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[3].Level,
                "3"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[0].CurrLine,
                "4"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[1].CurrLine,
                "9"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[2].CurrLine,
                "15"
            )

            assert.equal(
                testExceptionParser.exceptnInfoForUI.StackTrace[3].CurrLine,
                "18"
            )
        })
    })

    test("Test Full Exception Tag In Parts", function () {
        const xml1 =
            "<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_tspScript&quot;]:4:attempt to perform arithmetic on a nil value&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:4: "
        const xml2 =
            "in function `fun2&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:12: in function `fun1&apos;&#x240a;&#x2409;[string &quot;debug_kic_tspScript&quot;]:15: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:897: in function &lt;[string &quot;&quot;]:897&gt;&#x240a;&#x2409;[C]: "
        const xml3 =
            "in function `xpcall&apos;&#x240a;&#x2409;[string &quot;&quot;]:897: in function `kiExecuteWithDebugger&apos;&#x240a;&#x2409;[string &quot;&quot;]:1: in main chunk&#x240a;' name='debug_kic_tspScript' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>"

        const inputArr: string[] = []
        inputArr.push(xml1, xml2, xml3)
        inputArr.forEach((x) => {
            testExceptionParser.checkForException(x)
        })
        assert.isTrue(
            testExceptionParser.exceptionInfo.includes(
                "attempt to perform arithmetic on a nil value"
            )
        )
    })
})
