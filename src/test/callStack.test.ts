import { assert } from "chai"
import { suite, test } from "mocha"
import { CallStack } from "../callStack"
import { StacksInfo } from "../debugResourceManager"

suite("CallStack Test Suite", function () {
    let stackObj: CallStack
    const stackOutput = `<stacks>
    <stack le

    TSP> vel='0' currentline='2' func='function: a0b08020' linedefined='1' name='printHello' namewhat='global' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='Lua' frame='[string &quot;debug_kic_tspScript&quot;]:2: i

    TSP> n function "printHello&apos;'>
    <globals>
    <global name='print' value='function: a0a0efe0' type='function' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    <stack level='1' currentline='5' func='function: a0ac1658' lin

    TSP> edefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='main' frame='[string &quot;debug_kic_tspScript&quot;]:5: in main chunk'>
    <globals>
    <global name='prin

    TSP> tHello' value='function: a0b08020' type='function' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>`
    let stackStrArr: string[] = []
    this.beforeAll(() => {
        stackObj = new CallStack()
        stackStrArr = stackOutput.split("\n\n")
    })

    test("Create CallStack Object", function () {
        assert.equal(stackObj.isConversionCompleted(), false)
    })

    test("Conversion is not completed", () => {
        assert.equal(stackObj.isConversionCompleted(), false)
    })
    test("StackFrame is undefined", () => {
        const stackInfo = stackObj.getStackFrames()
        assert.equal(typeof stackInfo == "undefined", true)
    })
    test("Test convertStackXmlStrToJson", () => {
        let stack = ""
        stackStrArr.forEach((element) => {
            const eleChunk = element.trim().replaceAll("TSP> ", "")
            stack = stack.concat(eleChunk)
        })
        stack = stack.substring(
            stack.indexOf("<stacks>"),
            stack.indexOf("</stacks>") + "</stacks>".length
        )
        stackObj.convertStackXmlStrToJson(stack)
        const stackInfo = stackObj.getStackFrames()
        assert.equal(stackInfo instanceof StacksInfo, true)
        if (stackInfo) {
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[0]._attributes.currentline),
                2
            )
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[1]._attributes.currentline),
                5
            )
        }
    })
    test("Test CollectDataChunk", () => {
        let i = 0
        assert.equal(stackObj.isConversionStarted(), false)
        while (i < stackStrArr.length) {
            stackObj.collectDataChunk(stackStrArr[i])
            i += 1
        }

        const stackInfo = stackObj.getStackFrames()
        assert.equal(stackObj.isConversionCompleted(), true)
        assert.equal(stackInfo instanceof StacksInfo, true)
        if (stackInfo) {
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[0]._attributes.currentline),
                2
            )
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[1]._attributes.currentline),
                5
            )
        }
    })
})

suite("CallStackWithWatchpoint Test Suite", function () {
    let stackObj: CallStack
    const stackOutput = `<stacks>
    <stack le

    TSP> vel='0' currentline='2' func='function: a0b08020' linedefined='1' name='printHello' namewhat='global' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='Lua' frame='[string &quot;debug_kic_tspScript&quot;]:2: i

    TSP> n function "printHello&apos;'>
    <watchpoints>
    <watchpoint expression='localY + 10' value='20' type='number' />
</watchpoints>
    <globals>
    <global name='print' value='function: a0a0efe0' type='function' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    <stack level='1' currentline='5' func='function: a0ac1658' lin

    TSP> edefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='main' frame='[string &quot;debug_kic_tspScript&quot;]:5: in main chunk'>
    <watchpoints>
    <watchpoint expression='localY + 10' value='30' type='number' />
</watchpoints>
    <globals>
    <global name='prin

    TSP> tHello' value='function: a0b08020' type='function' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>`
    let stackStrArr: string[] = []
    this.beforeAll(() => {
        stackObj = new CallStack()
        stackStrArr = stackOutput.split("\n\n")
    })

    // InitialWatchpointVerification is to verify the watchpoints that are already added when debugger starts.
    // In that case multiple stack information will be sent from instrument and we need to parse each stacks information
    // separately.
    test("InitialWatchpointVerification", () => {
        let stack = ""
        stackStrArr.forEach((element) => {
            const eleChunk = element.trim().replaceAll("TSP> ", "")
            stack = stack.concat(eleChunk)
        })
        stack = stack.substring(
            stack.indexOf("<stacks>"),
            stack.indexOf("</stacks>") + "</stacks>".length
        )
        stackObj.convertStackXmlStrToJson(stack)
        const stackInfo = stackObj.getStackFrames()
        assert.equal(stackInfo instanceof StacksInfo, true)
        if (stackInfo) {
            if (stackInfo.stacks[0].stack[0].watchpoints[0].watchpoint[0]) {
                assert.equal(
                    parseInt(
                        stackInfo.stacks[0].stack[0].watchpoints[0]
                            .watchpoint[0]._attributes.value
                    ),
                    20
                )
                assert.equal(
                    parseInt(
                        stackInfo.stacks[0].stack[1].watchpoints[0]
                            .watchpoint[0]._attributes.value
                    ),
                    30
                )
                assert.equal(
                    stackInfo.stacks[0].stack[0].watchpoints[0].watchpoint[0]
                        ._attributes.expression,
                    "localY + 10"
                )
            }
        }
    })
})

suite("ConcatStacksWithWatchpoint Test Suite", function () {
    let stackObj: CallStack
    const stackOutput = `<stacks>
<stack le

vel='0' currentline='2' func='function: a0b08020' linedefined='1' name='printHello' namewhat='global' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='Lua' frame='[string &quot;debug_kic_tspScript&quot;]:2: i

n function "printHello&apos;'>
<watchpoints>
</watchpoints>
<globals>
<global name='print' value='function: a0a0efe0' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
<stack level='1' currentline='5' func='function: a0ac1658' lin

edefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='main' frame='[string &quot;debug_kic_tspScript&quot;]:5: in main chunk'>
<watchpoints>
</watchpoints>
<globals>
<global name='prin

tHello' value='function: a0b08020' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
</stacks>
<stacks>
<stack le

vel='0' currentline='2' func='function: a0b08020' linedefined='1' name='printHello' namewhat='global' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='Lua' frame='[string &quot;debug_kic_tspScript&quot;]:2: i

n function "printHello&apos;'>
<watchpoints>
<watchpoint expression='localY + 10' value='20' type='number' />
</watchpoints>
<globals>
<global name='print' value='function: a0a0efe0' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
<stack level='1' currentline='5' func='function: a0ac1658' lin

edefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='main' frame='[string &quot;debug_kic_tspScript&quot;]:5: in main chunk'>
<watchpoints>
<watchpoint expression='localY + 10' value='30' type='number' />
</watchpoints>
<globals>
<global name='prin

tHello' value='function: a0b08020' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
</stacks>
<stacks>
<stack le

vel='0' currentline='2' func='function: a0b08020' linedefined='1' name='printHello' namewhat='global' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='Lua' frame='[string &quot;debug_kic_tspScript&quot;]:2: i

n function "printHello&apos;'>
<watchpoints>
<watchpoint expression='localY + 10' value='20' type='number' />
<watchpoint expression='m' value='30' type='number' />
</watchpoints>
<globals>
<global name='print' value='function: a0a0efe0' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
<stack level='1' currentline='5' func='function: a0ac1658' lin

edefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_tspScript&quot;]' source='debug_kic_tspScript' what='main' frame='[string &quot;debug_kic_tspScript&quot;]:5: in main chunk'>
<watchpoints>
<watchpoint expression='localY + 10' value='30' type='number' />
<watchpoint expression='m' value='25' type='number' />
</watchpoints>
<globals>
<global name='prin

tHello' value='function: a0b08020' type='function' />
</globals>
<upvalues>
</upvalues>
<locals>
</locals>
</stack>
</stacks>`
    let stackStrArr: string[] = []
    this.beforeAll(() => {
        stackObj = new CallStack()
        stackStrArr = stackOutput.split("\n\n")
    })

    function watchpointVerification(
        stacksInfo: StacksInfo | undefined,
        expectedStackInfo: StacksInfo | undefined
    ) {
        // write code to verify the watchpoints of stackInfo and expectedStackInfo

        if (stacksInfo == undefined && expectedStackInfo == undefined) {
            return true
        }

        if (stacksInfo == undefined || expectedStackInfo == undefined) {
            return false
        }

        if (stacksInfo.stacks.length != expectedStackInfo.stacks.length) {
            return false
        }

        const exStacks = expectedStackInfo.stacks
        const acStacks = stacksInfo.stacks

        for (let i = 0; i < exStacks.length; i++) {
            const exStack = exStacks[i].stack
            const acStack = acStacks[i].stack

            if (exStack.length != acStack.length) {
                return false
            }

            for (let j = 0; j < exStack.length; j++) {
                const exWatchpoints = exStack[j].watchpoints
                const acWatchpoints = acStack[j].watchpoints

                if (exWatchpoints.length != acWatchpoints.length) {
                    return false
                }

                for (let k = 0; k < exWatchpoints.length; k++) {
                    const exWatchpoint = exWatchpoints[k].watchpoint
                    const acWatchpoint = acWatchpoints[k].watchpoint

                    if (exWatchpoint.length != acWatchpoint.length) {
                        return false
                    }

                    for (let l = 0; l < exWatchpoint.length; l++) {
                        const exWatchpointAttr = exWatchpoint[l]._attributes
                        const acWatchpointAttr = acWatchpoint[l]._attributes

                        if (
                            exWatchpointAttr.expression !=
                            acWatchpointAttr.expression
                        ) {
                            return false
                        }

                        if (exWatchpointAttr.type != acWatchpointAttr.type) {
                            return false
                        }

                        if (exWatchpointAttr.value != acWatchpointAttr.value) {
                            return false
                        }
                    }
                }
            }
        }
        return true
    }

    test("WatchpointVerification", () => {
        let i = 0
        assert.equal(stackObj.isConversionStarted(), false)
        // Get first stack information and process it.
        while (i < stackStrArr.length && !stackObj.isConversionCompleted()) {
            stackObj.collectDataChunk(stackStrArr[i])
            i += 1
        }
        const stackInfo = stackObj.getStackFrames()
        assert.equal(stackInfo instanceof StacksInfo, true)
        if (stackInfo) {
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[0]._attributes.currentline),
                2
            )
            assert.equal(
                parseInt(stackInfo.stacks[0].stack[1]._attributes.currentline),
                5
            )
        }
        const expectedStackInfo2: StacksInfo = {
            stacks: [
                {
                    stack: [
                        {
                            _attributes: {
                                currentline: "2",
                                name: "printHello",
                                level: "0",
                            },
                            watchpoints: [
                                {
                                    watchpoint: [
                                        {
                                            _attributes: {
                                                expression: "localY + 10",
                                                type: "number",
                                                value: "20",
                                            },
                                        },
                                    ],
                                },
                            ],
                            globals: [],
                            locals: [],
                            upvalues: [],
                        },
                        {
                            _attributes: {
                                currentline: "5",
                                name: "(defined at line 0)",
                                level: "1",
                            },
                            watchpoints: [
                                {
                                    watchpoint: [
                                        {
                                            _attributes: {
                                                expression: "localY + 10",
                                                type: "number",
                                                value: "30",
                                            },
                                        },
                                    ],
                                },
                            ],
                            globals: [],
                            locals: [],
                            upvalues: [],
                        },
                    ],
                },
            ],
        }

        // Sending chunck to collectDataChunk will set isConversionCompleted to False.
        stackObj.collectDataChunk(stackStrArr[i])
        i += 1
        while (i < stackStrArr.length && !stackObj.isConversionCompleted()) {
            stackObj.collectDataChunk(stackStrArr[i])
            i += 1
        }

        // StackInfo of second stacks
        const stackInfo2 = stackObj.getStackFrames()
        assert(watchpointVerification(stackInfo2, expectedStackInfo2))
        const expectedStackInfo3: StacksInfo = {
            stacks: [
                {
                    stack: [
                        {
                            _attributes: {
                                currentline: "2",
                                name: "printHello",
                                level: "0",
                            },
                            watchpoints: [
                                {
                                    watchpoint: [
                                        {
                                            _attributes: {
                                                expression: "localY + 10",
                                                type: "number",
                                                value: "20",
                                            },
                                        },
                                        {
                                            _attributes: {
                                                expression: "m",
                                                type: "number",
                                                value: "30",
                                            },
                                        },
                                    ],
                                },
                            ],
                            globals: [],
                            locals: [],
                            upvalues: [],
                        },
                        {
                            _attributes: {
                                currentline: "5",
                                name: "(defined at line 0)",
                                level: "1",
                            },
                            watchpoints: [
                                {
                                    watchpoint: [
                                        {
                                            _attributes: {
                                                expression: "localY + 10",
                                                type: "number",
                                                value: "30",
                                            },
                                        },
                                        {
                                            _attributes: {
                                                expression: "m",
                                                type: "number",
                                                value: "25",
                                            },
                                        },
                                    ],
                                },
                            ],
                            globals: [],
                            locals: [],
                            upvalues: [],
                        },
                    ],
                },
            ],
        }

        // Sending chunck to collectDataChunk will set isConversionCompleted to False.
        stackObj.collectDataChunk(stackStrArr[i])
        i += 1
        while (i < stackStrArr.length && !stackObj.isConversionCompleted()) {
            stackObj.collectDataChunk(stackStrArr[i])
            i += 1
        }

        // StackInfo of second stacks
        const stackInfo3 = stackObj.getStackFrames()
        assert(watchpointVerification(stackInfo3, expectedStackInfo3))
    })
})
