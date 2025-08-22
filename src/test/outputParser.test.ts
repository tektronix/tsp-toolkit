import { assert } from "chai"
import { suite, test } from "mocha"
import { OutputParser } from "../outputParser"

suite("Output Parser Test Suite", function () {
    let testOutputParser: OutputParser
    const tspTag = "tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4"
    this.beforeAll(() => {
        testOutputParser = new OutputParser()
    })

    test("Test ResumeRun Input", function () {
        const resumeRun = `<${tspTag}><resume-run/></${tspTag}>
output
<${tspTag}><breakpoint/>
</${tspTag}>
<${tspTag}><debug-prompt /></${tspTag}>`
        testOutputParser.collectDataChunk(resumeRun)
        assert.isTrue(testOutputParser.isParsingCompleted())
        const output = testOutputParser.getParsedOutput()
        assert.isTrue(output.includes("output"))
    })

    test("Test ResumeStepin Input", function () {
        const resumeStepin = `<${tspTag}><resume-stepin/><resume-stepin/></${tspTag}>
output
<${tspTag}>
<breakpoint/>
</${tspTag}>
<${tspTag}><debug-prompt /></${tspTag}>`

        testOutputParser.collectDataChunk(resumeStepin)
        assert.isTrue(testOutputParser.isParsingCompleted())
        let output = testOutputParser.getParsedOutput()
        while (output == "") {
            output = testOutputParser.getParsedOutput()
        }
        assert.isTrue(output.includes("output\n"))
    })

    test("Test ResumeStepout Input", function () {
        const resumeStepout = `<${tspTag}><resume-stepout/></${tspTag}>
output
<${tspTag}><debug-prompt /></${tspTag}>`

        testOutputParser.collectDataChunk(resumeStepout)
        assert.isTrue(testOutputParser.isParsingCompleted())
        let output = testOutputParser.getParsedOutput()
        while (output == "") {
            output = testOutputParser.getParsedOutput()
        }
        assert.isTrue(output.includes("output\n"))
    })

    test("Test ResumeStepover Input", function () {
        const resumeStepover = `<${tspTag}><resume-stepover/></${tspTag}>
output
<${tspTag}><breakpoint/></${tspTag}>
<${tspTag}><debug-prompt /></${tspTag}>`

        testOutputParser.collectDataChunk(resumeStepover)
        assert.isTrue(testOutputParser.isParsingCompleted())
        const output = testOutputParser.getParsedOutput()
        assert.isTrue(output.includes("output\n"))
    })

    test("Test Multiline Input", function () {
        const multiLine = `<${tspTag}><resume-stepout/></${tspTag}>
output1
output2
<${tspTag}></${tspTag}>
<${tspTag}><debug-prompt /></${tspTag}>`

        testOutputParser.collectDataChunk(multiLine)
        assert.isTrue(testOutputParser.isParsingCompleted())
        let output = testOutputParser.getParsedOutput()
        while (output == "") {
            output = testOutputParser.getParsedOutput()
        }
        assert.isTrue(output.includes("output1\noutput2\n"))
    })

    test("Test Session-Begin Input", function () {
        const sessionbegin = `<${tspTag}><session-begin/></${tspTag}>
output1
output2
<${tspTag}></${tspTag}>
<${tspTag}><debug-prompt /></${tspTag}>`

        testOutputParser.collectDataChunk(sessionbegin)
        assert.isTrue(testOutputParser.isParsingCompleted())
        const output = testOutputParser.getParsedOutput()
        assert.isTrue(output.includes("output1\noutput2\n"))
    })

    //This tests output included by the message loop
    test("Test Session-End Input Excludes output", function () {
        const sessionbegin = `<${tspTag}><session-begin/></${tspTag}>
output1
output2
<${tspTag}><debug-prompt /></${tspTag}>
`

        testOutputParser.collectDataChunk(sessionbegin)
        assert.isTrue(testOutputParser.isParsingCompleted())
        const output = testOutputParser.getParsedOutput()
        assert.isTrue(output.includes("output1\noutput2\n"))
    })

    test("Execution Failed", function () {
        const scriptOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application running...</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><resume-run /></tspdbg-AA4E9540-A46C

-4671-81D7-4FE69A9B6DC4>
am a
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><breakpoint line='5' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application hit breakpoint at line 5</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
  <stacks>
    <stack level='0' currentline='5' func='function: abe498' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:5: in main chunk'>
  <watchpoints>
    <watchpoint expression='x .. &quot;xyz&quot;' value='[string &quot;return x .. &quot;xyz&quot;...&quot;]:1: attempt to concatenate global x&apos; (a nil value)' type='string' />
</watchpoints>
  <globals>
    <global name='printGlobals' value='function: 118f110' type='function' />
    <global name='a' value='5' type='number' />
  </globals>
  <upvalues>
  </upvalues>
  <locals>
    <local name='b' value='10' type='number' />
  </locals>
    </stack>
  </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application running...</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><resume-run /></tspdbg-AA4E9540-A46C

-4671-81D7-4FE69A9B6DC4>
lua
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><execution-failed error='[string &quot;debug_kic_callStacks&quot;]:7:attempt to call a number value&#x240a;stack trackback:&#x240a;&#x2409;(tail call): ?&#x240a;&#x2409;[string &quot;debug_kic_callStacks&quot;]:7: in main chunk&#x240a;&#x2409;[string &quot;&quot;]:950: in function &lt;[string &quot;&quot;]:950&gt;&#x240a;&#x2409;[C]: in function xpcall&apos;&#x240a;&#x2409;[string &quot;&quot;]:950: in function kiExecuteWithDebugger&apos;&#x240a;&#x2409;[string &quot;&quot;]:1: in main chunk&#x240a;' name='debug_kic_callStacks' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
        `

        let stackStrArr: string[] = []
        stackStrArr = scriptOutput.split("\n\n")
        const output: string[] = []
        let outputIndex = 0
        let i = 0
        while (i < stackStrArr.length) {
            testOutputParser.collectDataChunk(stackStrArr[i])
            i += 1
            if (testOutputParser.isParsingCompleted()) {
                output.push(testOutputParser.getParsedOutput())
            }
        }

        assert.isTrue(output[outputIndex].includes("am a\n"))
        outputIndex += 1
        assert.isTrue(output[outputIndex].includes("lua \n"))
    })

    test("RunScriptWithoutBreakpoint", function () {
        const scriptOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-begin kiDebuggerVersion='0.9.1.2013.0520' name='debug_kic_callStacks' truncated-source='print(&quot;I &quot;)&#x240a;a = 5&#x240a;print(&quot;am a&quot;)&#x240a;local b = 10&#x240a;print(&quot;lua &quot;)&#x240a;local c = 15&#x240a;for i = 1, 15, 1 do&#x240a;    print(&quot;i is &quot; , i)&#x240a;end&#x240a;&#x240a;&#x240a;print(&quot;' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
I
am a
lua

i is 	1
i is 	2
i is 	3
i is 	4
i is 	5
i is 	6
i is 	7
i is 	8
i is 	9
i is 	10
i is 	11
i is 	12
i is 	13
i is 	14
i is 	15
script
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><sess

ion-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>`

        let stackStrArr: string[] = []
        stackStrArr = scriptOutput.split("\n\n")
        const output: string[] = []
        let i = 0
        while (i < stackStrArr.length) {
            testOutputParser.collectDataChunk(stackStrArr[i])
            i += 1
            if (testOutputParser.isParsingCompleted()) {
                output.push(testOutputParser.getParsedOutput())
            }
        }

        assert.isTrue(
            output[0].includes(
                "I \nam a\nlua i is \t1\ni is \t2\ni is \t3\ni is \t4\ni is \t5\ni is \t6\ni is \t7\ni is \t8\ni is \t9\ni is \t10\ni is \t11\ni is \t12\ni is \t13\ni is \t14\ni is \t15\nscript\n"
            )
        )
    })

    test("Output with initial added watchpoints", function () {
        const scriptOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-begin kiDebuggerVersion='0.9.1.2013.0520' name='debug_kic_callStacks' truncated-source='print(&quot;I &quot;)&#x240a;m = 5&#x240a;print(&quot;am a&quot;)&#x240a;local b = 5&#x240a;print(&quot;lua &quot;)&#x240a;local x = &quot;ab&quot;&#x240a;for i = 1, 15, 1 do&#x240a;    print(&quot;i is &quot; , i)&#x240a;end&#x240a;print(&quot;s' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
I
am a

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><breakpoint line='4' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application hit breakpoint at line 4</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
    <stacks>
    <stack level='0' currentline='4' func='function: 1180b40' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:4: in main chunk'>
    <watchpoints>
</watchpoints>
    <globals>
    <global name='m' value='5' type='number' />
    <global name='printGlobals' value='function: 1280ce0' type='function' />
    <global name='a' value='5' type='number' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
    <stacks>
    <stack level='0' currentline='4' func='function: 1180b40' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:4: in main chunk'>
    <watchpoints>
    <watchpoint expression='m' value='5' type='number' />
</watchpoints>
    <globals>
    <global name='m' value='5' type='number' />
    <global name

='printGlobals' value='function: 149eee0' type='function' />
    <global name='a' value='5' type='number' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
    <stacks>
    <stack level='0' currentline='4' func='function: 1180b40' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:4: in main chunk'>
    <watchpoints>
    <watchpoint expression='x .. &quot;xyz&quot;' value='[string &quot;return x .. &quot;xyz&quot;...&quot;]:1: attempt to concatenate global x&apos; (a nil value)' type='string' />
    <watchpoint expression='m' value='5' type='number' />
</watchpoints>
    <globals>
    <global name='m' value='5' type='number' />
    <global name='printGlobals' value='function: 11f8740' type='function' />
    <global name='a' value='5' type='number' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
    <stacks>
    <stack level='0' currentline='4' func='function: 1180b40' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:4: in main chunk'>
    <watchpoints>
    <watchpoint expression='x .. &quot;xyz&quot;' value='[string &quot;return x .. &quot;xyz&quot;...&quot;]:1: attempt to concatenate global x&apos; (a nil value)' type='string' />
    <watchpoint expression='b + 7' value='[string &quot;return b + 7...&quot;]:1: attempt to perform arithmetic on global b&apos; (a nil value)' type='string' />
    <watchpoint expression='m' value='5' type='number' />
</watchpoints>
    <globals>
    <global name='m' value='5' type='number' />
    <global name='printGlobals' value='function: 11e0ca8' type='function' />
    <global name='a' value='5' type='number' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    </locals>
    </stack>
    </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><resume-stepover /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><suspend-stepover line='5' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application stepped over function to line 5</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
    <stacks>
    <stack level='0' currentline='5' func='function: 1180b40' linedefined='0' name='(defined at line 0)' namewhat='' nups='0' short_src='[string &quot;debug_kic_callStacks&quot;]' source='debug_kic_callStacks' what='main' frame='[string &quot;debug_kic_callStacks&quot;]:5: in main chunk'>
    <watchpoints>
    <watchpoint expression='x .. &quot;xyz&quot;' value='[string &quot;return x .. &quot;xyz&quot;...&quot;]:1: attempt to concatenate global x&apos; (a nil value)' type='string' />
    <watchpoint expression='b + 7' value='12' type='number' />
    <watchpoint expression='m' value='5' type='number' />
</watchpoints>
    <globals>
    <global name='m' value='5' type='number' />
    <global name='printGlobals' value='function: 132a168' type='function' />
    <global name='a' value='5' type='number' />
    </globals>
    <upvalues>
    </upvalues>
    <locals>
    <local name='b' value='5' type='number' />
    </locals>
    </stack>
    </stacks>
</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >Application running...</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-text >DEBUG~~ECHO~~OFF DEBUG CONSOLE</debug-text></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><resume-run /></tspdbg-AA4E9540-A46C

-4671-81D7-4FE69A9B6DC4>

lua
i is 	1
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>`

        assert.isTrue(true)
        let stackStrArr: string[] = []
        stackStrArr = scriptOutput.split("\n\n")
        const output: string[] = []
        const expectOutput = ["am", "lua"]
        let expIndex = 0
        let i = 0
        while (i < stackStrArr.length) {
            testOutputParser.collectDataChunk(stackStrArr[i])
            i += 1
            if (testOutputParser.isParsingCompleted()) {
                output.push(testOutputParser.getParsedOutput())
            }
        }
        for (let i = 0; i < output.length; i++) {
            if (output[i] != "") {
                assert.isTrue(output[i].includes(expectOutput[expIndex]))
                expIndex += 1
            }
        }
    })

    test("Run2470ScriptWithoutBreakpoint", function () {
        const scriptOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-begin kiDebuggerVersion='0.9.1.2013.0520' name='debug_kic_2470Scirpt' truncated-source='--[[&#x240a;&#x2409;&#x240a;&#x2409;Description:&#x2409;This Model 2450 example shows you how to sweep the &#x240a;&#x2409;test current and measure the resulting voltage drop on' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>
Current	Voltage
1.34095e-06	-1.00001
<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>`

        testOutputParser.collectDataChunk(scriptOutput)
        if (testOutputParser.isParsingCompleted()) {
            assert.isTrue(
                testOutputParser
                    .getParsedOutput()
                    .includes("Current	Voltage\n1.34095e-06	-1.00001")
            )
        }
    })

    test("Run2470TableScriptWithoutBreakpoint", function () {
        const scriptOutput = `<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-begin kiDebuggerVersion='0.9.1.2013.0520' name='debug_kic_2470Scirpt' truncated-source='--[[&#x240a;&#x2409;&#x240a;&#x2409;Description:&#x2409;This Model 2450 example shows you how to measure the &#x240a;&#x2409;leakage current of a device such as a capacitor.  Th' /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>

Rdg #	Time (s)	Current (A)
1	0	1.0049959476e-10
2	0.06935146	8.12186568e-11
3	0.13867302	7.7087072836e-11
4	0.20799038	7.7775549889e-11
5	0.27731556	8.8793292163e-11
6	0.34663358	9.1547727732e-11
7	0.41595422	8.1218629044e-11
8	0.48528012	7.5709813419e-11
9	0.55459994	7.0889530357e-11
10	0.6239204	7.2955350094e-11
11	0.6932471	7.5709757907e-11
12	0.76256554	8.6727583448e-11
13	0.83188562	7.2955322339e-11
14	0.90120366	7.0889530357e-11
15	0.97052152	8.3284504293e-11
16	1.0398425	7.2955322339e-11
17	1.1091587	8.2595888462e-11
18	1.17847868	8.4661680444e-11
19	1.2477988	7.5709813419e-11
20	1.31711694	7.8464193476e

-11
21	1.38644272	7.9841369627e-11
22	1.45574162	7.1578035166e-11
23	1.52506072	7.5021142076e-11
24	1.59438728	8.0529929947e-11
25	1.6637067	7.9152698285e-11
26	1.7330259	8.6038828839e-11
27	1.80235278	7.4332526245e-11
28	1.8716708	7.1578146188e-11
29	1.94098908	6.9512270939e-11
30	2.01031586	8.190721712e-11
31	2.07963192	9.3613602981e-11
32	2.14895166	7.2266734263e-11
33	2.21825076	7.0200831259e-11
34	2.2875502	7.1578201699e-11
35	2.35684606	7.2266734263e-11
36	2.42616586	7.4332526245e-11
37	2.49549274	7.6

398373738e-11
38	2.56481184	7.2955322339e-11
39	2.63411114	6.6757863126e-11
40	2.70341598	7.2266734263e-11
41	2.77273546	7.3643965925e-11
42	2.84205774	7.5709674641e-11
43	2.9113845	8.2595832951e-11
44	2.98070358	8.3284504293e-11
45	3.05002452	7.1578146188e-11
46	3.11935384	7.8464221231e-11
47	3.18867232	7.7086989569e-11
48	3.25799236	7.2266734263e-11
49	3.32731186	8.6727389159e-11
50	3.39662978	9.4302080034e-11
51	3.46594918	7.5709646885e-11
52	3.5352689	7.7086878547e-11
53	3.60459226	6.9512215428e-11
54	3

.67391188	7.1578062921e-11
55	3.74323862	7.9152698285e-11
56	3.81255442	8.8104704088e-11
57	3.88187362	7.0889502601e-11
58	3.95116894	7.1578201699e-11
59	4.02047492	7.1578173944e-11
60	4.08979622	7.2266734263e-11
61	4.15911298	7.3643965925e-11
62	4.22843998	7.639842925e-11
63	4.29775858	7.7775494378e-11
64	4.36707794	7.4332470734e-11
65	4.43638218	7.0889474846e-11
66	4.5057023	7.1578118432e-11
67	4.57502286	7.5709702396e-11
68	4.64434398	8.0529985458e-11
69	4.71366398	7.4332470734e-11
70	4.782982	6.9512298695e-11
71	4.85229826	7.9152781551e-11
72	4.92161608	8.6727416915e-11
73	4.99093524	7.5021

031054e-11
74	5.06025218	8.3972953591e-11
75	5.12957814	7.7087017325e-11
76	5.19889686	7.2955405606e-11
77	5.26821628	7.1578201699e-11
78	5.33754272	7.0200942281e-11
79	5.40686234	7.5709757907e-11
80	5.47618308	7.2266706508e-11
81	5.54551312	7.5021169832e-11
82	5.614833	7.5709785663e-11
83	5.68413202	6.8135178055e-11
84	5.75345228	7.2955266828e-11
85	5.82275082	7.1578090677e-11
86	5.8920478	7.1578090677e-11
87	5.96136662	7.9152781551e-11
88	6.03068352	7.9152809307e-11
89	6.0999804	7.0889363823e-11

<tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4><session-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>`

        let stackStrArr: string[] = []
        stackStrArr = scriptOutput.split("\n\n")
        console.log(stackStrArr.length)
        const expectedOutputArr = stackStrArr.slice(1, stackStrArr.length - 1)
        const output: string[] = []
        const concatStringArr = function (stringArr: string[]): string {
            let concatStr = ""
            stringArr.forEach((element) => {
                concatStr += element
            })
            return concatStr
        }
        let i = 0
        while (i < stackStrArr.length) {
            testOutputParser.collectDataChunk(stackStrArr[i])
            i += 1
            if (testOutputParser.isParsingCompleted()) {
                output.push(testOutputParser.getParsedOutput())
            }
        }
        assert.equal(
            concatStringArr(output),
            concatStringArr(expectedOutputArr)
        )
    })
})
