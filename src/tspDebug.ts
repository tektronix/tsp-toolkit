import { EventEmitter } from "stream"
import { basename } from "node:path"
import * as vscode from "vscode"
import {
    Breakpoint,
    Handles,
    InitializedEvent,
    LoggingDebugSession,
    OutputEvent,
    Scope,
    Source,
    StoppedEvent,
    TerminatedEvent,
    Thread,
} from "@vscode/debugadapter"
import { DebugProtocol } from "@vscode/debugprotocol"
import { TspRuntime } from "./tspRuntime"
import {
    BreakPoint,
    DebugInfo,
    RuntimeVariable,
    VariableAttributes,
} from "./debugResourceManager"
import { DebugHelper } from "./resourceManager"
import { Log } from "./logging"
import { Connection } from "./connection"

/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the "program" to debug. */
    program: string
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean
    /** enable logging the Debug Adapter Protocol */
    trace?: boolean
    /** run without debugging */
    noDebug?: boolean
    /** if specified, results in a simulated compile error in launch. */
    compileError?: "default" | "show" | "hide"
}

/**
 * Creates a new debug adapter that is used for one debug session.
 * We configure the default implementation of a debug adapter here.
 */
export class TspDebugSession extends LoggingDebugSession {
    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static threadID = 1

    /*
     * TspRuntime spawns a child process to communicate with kic.exe and emits events upon response from kic.exe
     */
    private _tspRuntime: TspRuntime | undefined
    //private _kicProcMgr: KicProcessMgr | undefined

    private _configurationDone = new EventEmitter()

    private _debuggeeFilePath = ""

    private sendDebuggerFile = true

    private _breakPoints: BreakPoint[] = []
    private _watchExpressions: string[] = []
    private _referenceToFrameId: Map<number, number> = new Map()

    private _variableHandles = new Handles<
        "locals" | "globals" | "upvalues" | RuntimeVariable
    >(1003)
    public sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    private _doReconnect = false
    private _connection: Connection | undefined
    private _disconnectDonePromise: Promise<void> | undefined

    public constructor(connection: Connection) {
        super()

        // this debugger uses one-based lines
        this.setDebuggerLinesStartAt1(true)
        //this.setDebuggerColumnsStartAt1(false)

        if (
            connection == undefined ||
            DebugHelper.debuggeeFilePath == undefined
        )
            return

        this._connection = connection
        this._debuggeeFilePath = DebugHelper.debuggeeFilePath
        this._doReconnect = true
        this._tspRuntime = new TspRuntime(connection)
        this._disconnectDonePromise = new Promise((res) => {
            this.on("disconnectDone", res)
        })
        //register for events emitted by _tspRuntime here
        this._tspRuntime.on("stopOnBreakpoint", () => {
            this.sendEvent(
                new StoppedEvent("breakpoint", TspDebugSession.threadID),
            )
        })

        //sending this event for step-over, step-in, step-out
        this._tspRuntime.on("stopOnStep", () => {
            this.sendEvent(new StoppedEvent("step", TspDebugSession.threadID))
        })

        //when session-end is received from ki-debugger
        this._tspRuntime.on("endSession", () => {
            this.sendEvent(new TerminatedEvent())
        })

        // when exception occurs in ki-debugger
        this._tspRuntime.on("debugExecException", (errData: string) => {
            void vscode.window.showErrorMessage(errData)
        })

        //when exceution-failed (Runtime exception occured)
        this._tspRuntime.on("runtimeException", () => {
            this.sendEvent(
                new StoppedEvent("exception", TspDebugSession.threadID),
            )
        })

        this._tspRuntime.on("setVariableError", (data: string) => {
            void vscode.window.showErrorMessage(data)
        })

        this._tspRuntime.on("outputToDebuggeeConsole", (data: string) => {
            const e: DebugProtocol.OutputEvent = new OutputEvent(`${data}`)
            //e.body.group = "startCollapsed"
            e.body.category = "console"
            e.body.output = data
            this.sendEvent(e)
        })

        this._tspRuntime.on("restartConnection", () => {
            this._disconnectDonePromise
                ?.then(() => {
                    void this.doRestartConnection()
                })
                .catch((err) => {
                    Log.error(`${new String(err).toString()}`, {
                        file: "tspDebug.ts",
                        func: "TspDebugSession.constructor()",
                    })
                })
        })
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
    ): void {
        // build and return the capabilities of this debug adapter:
        response.body = response.body || {}

        // Supported Capabilities/options
        response.body.supportsConfigurationDoneRequest = true
        response.body.supportsSetVariable = true
        response.body.supportsExceptionInfoRequest = true
        response.body.supportsBreakpointLocationsRequest = true
        response.body.supportsRestartRequest = true

        //Unsupported Capabilities/options
        response.body.supportsFunctionBreakpoints = false
        response.body.supportsConditionalBreakpoints = false
        response.body.supportsHitConditionalBreakpoints = false
        response.body.supportsEvaluateForHovers = false
        //UNSUPPORTED: exceptionBreakpointFilters?: ExceptionBreakpointsFilter[];
        response.body.supportsStepBack = false
        response.body.supportsRestartFrame = false
        response.body.supportsGotoTargetsRequest = false
        response.body.supportsStepInTargetsRequest = false
        response.body.supportsCompletionsRequest = false
        //UNSUPPORTED completionTriggerCharacters?: string[];
        response.body.supportsModulesRequest = false
        //UNSUPPORTED: additionalModuleColumns?: ColumnDescriptor[];
        //UNSUPPORTED: supportedChecksumAlgorithms?: ChecksumAlgorithm[];
        response.body.supportsExceptionOptions = false
        response.body.supportsValueFormattingOptions = false
        response.body.supportTerminateDebuggee = false
        response.body.supportSuspendDebuggee = false
        response.body.supportsDelayedStackTraceLoading = false
        response.body.supportsLoadedSourcesRequest = false
        response.body.supportsLogPoints = false
        response.body.supportsTerminateThreadsRequest = false
        response.body.supportsSetExpression = false
        response.body.supportsTerminateRequest = false
        response.body.supportsDataBreakpoints = false
        response.body.supportsReadMemoryRequest = false
        response.body.supportsWriteMemoryRequest = false
        response.body.supportsDisassembleRequest = false
        response.body.supportsCancelRequest = false
        response.body.supportsClipboardContext = false
        response.body.supportsSteppingGranularity = false
        response.body.supportsInstructionBreakpoints = false
        response.body.supportsExceptionFilterOptions = false
        response.body.supportsSingleThreadExecutionRequests = false
        response.body.supportsDataBreakpointBytes = false
        //UNSUPPORTED: breakpointModes?: BreakpointMode[];
        response.body.supportsANSIStyling = false

        this.sendResponse(response)

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent())
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all breakpoints etc. have been sent to the Debug Adapter and that the 'launch' can start.
     */
    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments,
    ): void {
        super.configurationDoneRequest(response, args)
        // notify the launchRequest that configuration has finished
        this._configurationDone.emit("configurationDone")
    }

    protected launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: ILaunchRequestArguments,
    ) {
        const LOGLOC = {
            file: "tspDebug.ts",
            func: "TspDebugSession.launchRequest()",
        }
        // make sure to 'Stop' the buffered logging if 'trace' is not set

        this._configurationDone.on("configurationDone", () => {
            Log.debug("configuration completed", LOGLOC)
        })

        this.sleep(1000).then(
            () => {
                if (this.sendDebuggerFile === true) {
                    const debugInfo = new DebugInfo(
                        this._debuggeeFilePath,
                        this._breakPoints,
                    )
                    const debugInfoStr = JSON.stringify(debugInfo)
                    Log.debug(debugInfoStr, LOGLOC)

                    if (this._tspRuntime !== undefined)
                        this._tspRuntime.debugInfo = "'" + debugInfoStr + "'"
                    this.sendDebuggerFile = false
                }

                //await this.sleep(2000)

                if (!this._tspRuntime?.isSessionInProgress()) {
                    this._tspRuntime?.start()
                }

                if (args.compileError) {
                    // simulate a compile/build error in "launch" request:
                    // the error should not result in a modal dialog since 'showUser' is set to false.
                    // A missing 'showUser' should result in a modal dialog.
                    const hide_categ =
                        args.compileError === "hide" ? false : undefined
                    this.sendErrorResponse(response, {
                        id: 1001,
                        format: "compile error: some fake error.",
                        showUser:
                            args.compileError === "show" ? true : hide_categ,
                    })
                } else {
                    this.sendResponse(response)
                }
            },
            () => {},
        )
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments,
    ) {
        const dp_arr: DebugProtocol.Breakpoint[] = []

        //ToDo: verified is true for now, need to change according to Tsp lang
        //Note: made several changes here as opposed to mock debug*

        if (this._debuggeeFilePath != args.source.path) {
            return
        }

        //When debug files are loaded then clearing all breakpoints
        if (this._tspRuntime?.isSessionInProgress()) {
            this._tspRuntime.clearBreakpoints()
        }
        args.breakpoints?.forEach((element) => {
            const bp = new Breakpoint(
                true,
                element.line,
            ) as DebugProtocol.Breakpoint
            dp_arr.push(bp)

            const breakPoint = new BreakPoint(element.line, true, "")
            this._breakPoints.push(breakPoint)

            //When debug files are loaded then setting breakpoint
            if (this._tspRuntime?.isSessionInProgress()) {
                this._tspRuntime.setBreakpoint(breakPoint)
            }
        })

        Promise.all<DebugProtocol.Breakpoint>(dp_arr).then(
            (res) => {
                // send back the actual breakpoint positions
                response.body = {
                    breakpoints: res,
                }

                this.sendResponse(response)
            },
            () => {},
        )
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse): void {
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            this.sendEvent(new TerminatedEvent())
        } else {
            Log.debug("write kiRun", {
                file: "tspDebug.ts",
                func: "TspDebugSession.continueRequest()",
            })
            this._tspRuntime?.writeToChildProc(".debug run\n", "ascii")
        }
        this.sendResponse(response)
    }

    protected nextRequest(response: DebugProtocol.NextResponse): void {
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            this.sendEvent(new TerminatedEvent())
        } else {
            Log.debug("write kiStepOver", {
                file: "tspDebug.ts",
                func: "TspDebugSession.nextRequest()",
            })
            this._tspRuntime?.writeToChildProc(".debug stepOver\n", "ascii")
        }
        this.sendResponse(response)
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            this.sendEvent(new TerminatedEvent())
        } else {
            Log.debug("write kiStepIn", {
                file: "tspDebug.ts",
                func: "TspDebugSession.stepInRequest()",
            })
            this._tspRuntime?.writeToChildProc(".debug stepIn\n", "ascii")
        }
        this.sendResponse(response)
    }

    /**
     * This request resumes execution until we go up a level in the call stack.
     */
    protected stepOutRequest(response: DebugProtocol.StepOutResponse): void {
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            this.sendEvent(new TerminatedEvent())
        } else {
            Log.debug("write kiStepOut", {
                file: "tspDebug.ts",
                func: "TspDebugSession.stepOutRequest()",
            })
            this._tspRuntime?.writeToChildProc(".debug stepOut\n", "ascii")
        }
        this.sendResponse(response)
    }

    /**
     * This request retrieves a list of all threads.
     * Currently we support only a single thread
     */
    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        // runtime supports no threads so just return a default thread.
        response.body = {
            threads: [new Thread(TspDebugSession.threadID, "thread 1")],
        }
        this.sendResponse(response)
    }

    protected stackTraceRequest(
        _response: DebugProtocol.StackTraceResponse,
    ): void {
        const _stacks = this._tspRuntime?.stack()
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            _response.body = {
                stackFrames: this._tspRuntime.exceptnInfoForUI.StackTrace.map(
                    (stk) => {
                        let _stackName = stk.Name
                        try {
                            if (
                                _stacks &&
                                _stacks.stacks[0].stack[parseInt(stk.Level)]
                            ) {
                                _stackName =
                                    _stacks.stacks[0].stack[parseInt(stk.Level)]
                                        ._attributes.name
                            }
                        } catch (error) {
                            Log.error(new String(error).toString(), {
                                file: "tspDebug.ts",
                                func: "TspDebugSession.stackTraceRequest()",
                            })
                        }
                        const sf: DebugProtocol.StackFrame = {
                            id: parseInt(stk.Level),
                            name:
                                _stackName == "(defined at line 0)"
                                    ? "Default Runtime"
                                    : _stackName,
                            source: this.createSource(this._debuggeeFilePath),
                            line: parseInt(stk.CurrLine),
                            column: 0,
                        }
                        return sf
                    },
                ),
                totalFrames:
                    this._tspRuntime.exceptnInfoForUI.StackTrace.length,
            }
        } else {
            if (_stacks) {
                _response.body = {
                    stackFrames: _stacks.stacks[0].stack.map((stk) => {
                        const sf: DebugProtocol.StackFrame = {
                            id: parseInt(stk._attributes.level),
                            name:
                                stk._attributes.name == "(defined at line 0)"
                                    ? "Default Runtime"
                                    : stk._attributes.name,
                            source: this.createSource(this._debuggeeFilePath),
                            line: parseInt(stk._attributes.currentline),
                            column: 0,
                        }
                        return sf
                    }),
                    totalFrames: _stacks.stacks.length,
                }
            }
        }

        this.sendResponse(_response)
    }

    /**
     * The extension host makes this call once the stack trace is updated to populate the scope types
     * Ex: locals, globals etc..
     */
    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        _args: DebugProtocol.ScopesArguments,
    ): void {
        const globalRef = this._variableHandles.create("globals")
        const localsRef = this._variableHandles.create("locals")
        const upvaluesRef = this._variableHandles.create("upvalues")

        this._referenceToFrameId.set(globalRef, _args.frameId)
        this._referenceToFrameId.set(localsRef, _args.frameId)
        this._referenceToFrameId.set(upvaluesRef, _args.frameId)

        response.body = {
            scopes: [
                new Scope("globals", globalRef, false),
                new Scope("locals", localsRef, false),
                new Scope("upvalues", upvaluesRef, false),
            ],
        }

        this.sendResponse(response)
    }

    /**
     * The extension host makes this call once the scope types are updated to populate the expanded scope type
     * Ex: If locals is expanded, then local variables are fetched
     * Expanded scope type is identified using _args.variablesReference
     */
    protected variablesRequest(
        response: DebugProtocol.VariablesResponse,
        _args: DebugProtocol.VariablesArguments,
    ) {
        const raw_var: RuntimeVariable[] = []

        /**
         * User settings to enable/disable functions in Variables pane
         */
        const show_func: boolean = vscode.workspace
            .getConfiguration("kic")
            .get("showFunction") as boolean

        const v = this._variableHandles.get(_args.variablesReference)
        const frameId = this._referenceToFrameId.get(_args.variablesReference)

        if (v == "globals" && frameId != undefined) {
            const res = this._tspRuntime?.globals(frameId)
            res?.forEach((x) => {
                x.stackLevel = frameId
                this.fillVariables(x, raw_var, show_func)
            })
        } else if (v == "locals" && frameId != undefined) {
            const res = this._tspRuntime?.locals(frameId)
            res?.forEach((x) => {
                x.stackLevel = frameId
                this.fillVariables(x, raw_var, show_func)
            })
        } else if (v == "upvalues" && frameId != undefined) {
            const res = this._tspRuntime?.upValues(frameId)
            res?.forEach((x) => {
                x.stackLevel = frameId
                this.fillVariables(x, raw_var, show_func)
            })
        } else {
            //for structured variables
            let v = this._variableHandles.get(_args.variablesReference)
            v = v as RuntimeVariable
            if (v && Array.isArray(v.value)) {
                v.value?.forEach((x) => {
                    this.fillVariables(x, raw_var, show_func)
                })
            }
        }

        response.body = {
            variables: raw_var.map((v) => this.convertFromRuntime(v)),
        }

        this.sendResponse(response)
    }

    /**
     ** The extension host makes this call on setting value of a variable.
     * @param response response to the request
     * @param args argument of the request
     */
    protected setVariableRequest(
        response: DebugProtocol.SetVariableResponse,
        args: DebugProtocol.SetVariableArguments,
    ) {
        let scopeType: string | undefined
        let res: VariableAttributes | undefined
        let argList: string[] = [args.name]
        let hierarchyArr: string[] | undefined = undefined
        const v = this._variableHandles.get(args.variablesReference)

        if (v != "globals" && v != "locals" && v != "upvalues") {
            if (v) {
                argList = [...v.argumentList]
                argList.push(args.name)
                hierarchyArr = [...argList]
                scopeType = v.scope
            } else {
                this.sendResponse(response)
                return
            }
        } else {
            scopeType = this._variableHandles.get(
                args.variablesReference,
            ) as string
            // this is required to send correct request to the debugger
            // argList: ['"a"']
            argList = ['"' + args.name + '"']
        }

        const frameId = this._referenceToFrameId.get(args.variablesReference)
        if (frameId != undefined) {
            this._tspRuntime?.setVariable(
                argList,
                args.value,
                scopeType,
                frameId,
            )
            this._tspRuntime?.updateStack().then(
                () => {
                    if (scopeType == "globals") {
                        res = this._tspRuntime?.global(
                            args.name,
                            frameId,
                            hierarchyArr,
                        )
                    } else if (scopeType == "locals") {
                        res = this._tspRuntime?.local(
                            args.name,
                            frameId,
                            hierarchyArr,
                        )
                    } else if (scopeType == "upvalues") {
                        res = this._tspRuntime?.upValue(
                            args.name,
                            frameId,
                            hierarchyArr,
                        )
                    }

                    if (res) {
                        response.body = {
                            value: res.value,
                            type: res.type,
                        }
                    }
                    this.sendResponse(response)
                },
                () => {},
            )
            return
        }

        this.sendResponse(response)
    }

    protected exceptionInfoRequest(
        response: DebugProtocol.ExceptionInfoResponse,
    ) {
        if (this._tspRuntime?.hasRTExceptionOccured()) {
            let stackTraceStr = ""
            this._tspRuntime.exceptnInfoForUI.StackTrace.forEach((item) => {
                stackTraceStr += item.CurrLine + " " + item.Name + "\n"
            })
            response.body = {
                exceptionId: "Exception ID",
                description: this._tspRuntime.exceptnInfoForUI.Description,
                breakMode: "always",
                details: {
                    message: this._tspRuntime.exceptnInfoForUI.Description,
                    typeName: "",
                    stackTrace: stackTraceStr,
                },
            }
        }
        this.sendResponse(response)
    }

    protected disconnectRequest(
        _response: DebugProtocol.DisconnectResponse,
        _args: DebugProtocol.DisconnectArguments,
    ): void {
        this._tspRuntime?.terminateDebugger()
        if (!_args.restart) this.emit("disconnectDone")
    }

    protected restartRequest(
        response: DebugProtocol.RestartResponse,
        //args: DebugProtocol.RestartArguments,
    ): void {
        this._tspRuntime?.restart()
        this.sendResponse(response)
    }

    private async doRestartConnection() {
        if (this._doReconnect) {
            await this._connection?.connect()
        }
        void vscode.window.showInformationMessage(
            "Global variables and functions of the script will remain in instrument memory. Power cycle the instrument to clear memory.",
        )
    }

    /**
     * Evaluates the given expression in the context of the topmost stack frame.
     * The expression has access to any variables and arguments that are in scope.
     *
     * @param response - respose to evaluate request
     * @param args - arguments for evaluate request
     */
    protected evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments,
    ) {
        let reply: string | undefined
        const ars = args
        Log.trace(`${JSON.stringify(ars)}`, {
            file: "tspDebug.ts",
            func: "TspDebugSession.evaluateRequest()",
        })

        const wp = {
            Expression: args.expression,
            Enable: true,
        }
        // If watchpoint expression not set in kiDebugger then set it
        if (!this._watchExpressions.includes(args.expression)) {
            this._watchExpressions.push(args.expression)
            this._tspRuntime?.writeToChildProc(
                ".debug setWatchpoint '" + JSON.stringify(wp) + "'\n",
                "utf-8",
            )
            this._tspRuntime?.updateStack().catch(() => {})
        }
        const wp_data = this._tspRuntime?.getWatchpointsForStackframe(
            args.frameId,
        )
        wp_data?.forEach((element) => {
            if (element._attributes.expression === args.expression.trim()) {
                reply = "found"

                const watchpt_val = element._attributes.value
                //watchpoint expression is not valid
                if (watchpt_val.includes("attempt to")) {
                    const res =
                        "Invalid Expression: " +
                        watchpt_val.substring(watchpt_val.indexOf("attempt"))
                    response.body = {
                        result: res,
                        variablesReference: 0,
                    }
                } else {
                    response.body = {
                        result: watchpt_val,
                        type: element._attributes.type,
                        variablesReference: 0,
                    }
                }
            }
        })
        if (!reply) {
            response.body = {
                result: "nil",
                variablesReference: 0,
            }
        }

        this.sendResponse(response)
    }

    //helper functions

    /**
     * Filters the variables that need to be shown in UI based on user settings
     * @param rv - variable to be checked against user choice
     * @param raw_var_arr - filtered array of variables
     * @param show_func - user choice to show/hide functions in Variables pane
     */
    private fillVariables(
        rv: RuntimeVariable,
        raw_var_arr: RuntimeVariable[],
        show_func: boolean,
    ) {
        if (rv.type === "function") {
            if (show_func) {
                raw_var_arr.push(rv)
            }
        } else {
            raw_var_arr.push(rv)
        }
    }

    private createSource(filePath: string): Source {
        return new Source(
            basename(filePath),
            this.convertDebuggerPathToClient(filePath),
        )
    }

    /**
     * This function takes variables sent from the executable and
     * converts it to variable understood by the extension host so as to update the UI
     */
    private convertFromRuntime(v: RuntimeVariable): DebugProtocol.Variable {
        const dapVariable: DebugProtocol.Variable = {
            name: String(v.name),
            value: "",
            type: v.type,
            variablesReference: 0,
            presentationHint: v.presentationHint,
        }

        if (Array.isArray(v.value)) {
            dapVariable.value = "table"
            v.reference = this._variableHandles.create(v)
            this._referenceToFrameId.set(v.reference, v.stackLevel)
            dapVariable.variablesReference = v.reference
        } else {
            dapVariable.value = v.value?.toString() ?? ""
        }

        return dapVariable
    }
}
