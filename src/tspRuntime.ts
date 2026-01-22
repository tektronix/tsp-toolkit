import { EventEmitter } from "events"
import * as cp from "node:child_process"
import { DEBUG_EXECUTABLE } from "./kic-cli"
import { CallStack } from "./callStack"
import {
    BreakPoint,
    ExcepnDetailsForUI,
    GlobalVariableAttributes,
    LocalVariableAttributes,
    Root,
    RuntimeExceptionHandler,
    RuntimeVariable,
    setVariableErrorHandler,
    SetVariableInfo,
    StacksInfo,
    TableVarParser,
    UpValueAttributes,
    VariableAttributes,
    Watchpoint,
} from "./debugResourceManager"
import { OutputParser } from "./outputParser"
import { Log } from "./logging"
import { Connection } from "./connection"

//type of breakpoint hit
enum BreakType {
    Breakpoint = 0,
    Stepped = 1,
}

export class TspRuntime extends EventEmitter {
    private _commsInitialized = false
    public debugInfo: string | undefined
    private _stacksInfo: StacksInfo | undefined
    private _stackObj = new CallStack()
    private _outputParser: OutputParser = new OutputParser()
    private _runtimeExHandler = new RuntimeExceptionHandler()
    private _setVarErrorHandler = new setVariableErrorHandler()
    private _tableParser = new TableVarParser()
    private _breakType: BreakType = 0
    private _sessionInProgress = false
    private _rtExceptionOccured = false
    public exceptnInfoForUI: ExcepnDetailsForUI = new ExcepnDetailsForUI()
    private _debugChidProc: cp.ChildProcessWithoutNullStreams
    private _scriptAbort = false
    private _output = ""
    private _setVariable = false
    private _isStackConversionPromiseFulfilled = false
    private _stackCompletePromise = new Promise((res) => {
        this.on("stackConversionComplete", res)
    })

    constructor(connection: Connection) {
        super()

        const args = ["connect", connection.addr]
        if (connection.keyring) {
            args.push("--keyring", String(connection.keyring))
        }
        this._debugChidProc = cp.spawn(DEBUG_EXECUTABLE, args)

        this._debugChidProc.on("close", () => {
            this.sendEvent("restartConnection")
        })

        this._debugChidProc.stdout.setEncoding("utf-8")
        this._debugChidProc.stdout.on("data", (data) => {
            const str = data as string

            if (str.includes("session-begin")) {
                this._scriptAbort = false
            }
            Log.trace(`data: ${str}`, {
                file: "tspRuntime.ts",
                func: "TspRuntime.constructor()",
            })

            if (this._commsInitialized == false) {
                if (
                    str.includes(
                        "Instrument is password protected or is unable to respond",
                    )
                ) {
                    this.sendEvent("instrLockedOrBadState")
                    this.endSession()
                } else if (str.includes("TSP> ")) {
                    this._commsInitialized = true
                    this.start()
                }
            } else {
                this._scriptAbort =
                    this._scriptAbort || str.includes("Script aborted")

                if (!this._scriptAbort) {
                    this._runtimeExHandler.checkForException(str)
                    this.showException()
                }

                this._setVarErrorHandler.checkForSetVarError(str)
                this.showSetVarError()

                this._stackObj.collectDataChunk(str)
                this._outputParser.collectDataChunk(str)
                if (this._outputParser.isParsingCompleted()) {
                    this._output = this._outputParser.getParsedOutput()
                    if (this._output != "") {
                        this.showOutput()
                    }
                }
                if (str.includes("Application hit breakpoint")) {
                    this._breakType = BreakType.Breakpoint
                } else if (
                    str.includes("Application stepped over") ||
                    str.includes("Application single stepped") ||
                    str.includes("Application stepped out")
                ) {
                    this._breakType = BreakType.Stepped
                } else if (
                    str.includes("Application set Local variable") ||
                    str.includes("Application set Global variable") ||
                    str.includes("Application set Up variable")
                ) {
                    // setting variable will not change debugger's state.
                    this._setVariable = true
                } else if (str.includes("session-end")) {
                    if (!this._scriptAbort && !this.hasRTExceptionOccured()) {
                        // normal debug session-end scenario
                        this.endSession()
                    }
                }
                if (this._stackObj.isConversionCompleted()) {
                    this._stacksInfo = this._stackObj.getStackFrames()
                    this.sendEvent("stackConversionComplete")
                    this._isStackConversionPromiseFulfilled = true
                    if (this._setVariable) {
                        this._setVariable = false
                        return
                    }
                    if (this._breakType == BreakType.Stepped) {
                        this.step()
                    } else {
                        this.continue()
                    }
                }
            }
        })

        this._debugChidProc.stderr.setEncoding("utf-8")
        this._debugChidProc.stderr.on("data", (errData) => {
            const errInfo = errData as string
            Log.error(`errData: ${errInfo}`, {
                file: "tspRuntime.ts",
                func: "TspRuntime.constructor()->kic-debug",
            })
            if (errInfo.includes("Error:")) {
                this.sendEvent("debugExecException", errInfo)
                this.endSession()
            }
        })
    }

    /**
     * start the actual debugging process
     */
    public start() {
        if (this.debugInfo != undefined && this._commsInitialized) {
            this.writeToChildProc(".debug " + this.debugInfo + "\n", "utf-8")
            this._sessionInProgress = true
        }
    }

    /**
     * When an updated Stack is expected, it will overwrite previous promise
     * to pending state.
     */
    public async updateStack() {
        // if promise is fulfilled, then make it in pending state.
        if (this._isStackConversionPromiseFulfilled) {
            this._stackCompletePromise = new Promise((res) => {
                this.on("stackConversionComplete", res)
            })
            this._isStackConversionPromiseFulfilled = false
        }

        await this._stackCompletePromise
    }

    /**
     * isSessionInProgress returns true if the session has successfully started
     * @returns {bool} `true` if there is a session in progress, `false` otherwise.
     */
    public isSessionInProgress(): boolean {
        return this._sessionInProgress
    }

    /**
     * hasRTExceptionOccured returns true if a run-time exception has occured
     * @returns {bool} `true` if exception has occured, `false` otherwise.
     */
    public hasRTExceptionOccured(): boolean {
        return this._rtExceptionOccured
    }

    public stack(): StacksInfo | undefined {
        return this._stacksInfo
    }

    /**
     * It gets watchpoint expressions for specific stack frame
     * @param stackframe stack frame number
     * @returns {Watchpoint[] | undefined } array of watchpoints if stacksframe is defined, else it returns undefined
     * @see Watchpoint
     */
    public getWatchpointsForStackframe(
        stackframe?: number,
    ): Watchpoint[] | undefined {
        if (stackframe === undefined) return
        let wp: Watchpoint[] | undefined
        this._stacksInfo?.stacks[0].stack.forEach((element) => {
            if (parseInt(element._attributes.level) == stackframe) {
                wp = element.watchpoints[0].watchpoint
            }
        })
        return wp
    }

    /**
     * It will terminate debugger, but it will not disconnect instrument as the user can continue using
     * the instrument once debugging is ended
     */
    public terminateDebugger() {
        //If the child process is still running, exitCode will be null
        if (this._debugChidProc.exitCode == null)
            this.writeToChildProc(".debug exit\n", "utf-8")
    }

    public writeToChildProc(data: string, encoding: BufferEncoding) {
        this._debugChidProc.stdin.write(data, encoding)
    }

    public continue() {
        this.sendEvent("stopOnBreakpoint")
    }

    public showOutput() {
        if (this._output) {
            this.sendEvent("outputToDebuggeeConsole", this._output)
        }
    }

    public showException() {
        if (this._runtimeExHandler.exceptionInfo) {
            this._rtExceptionOccured = true
            this.exceptnInfoForUI = this._runtimeExHandler.exceptnInfoForUI
            this.sendEvent("runtimeException")
        }
    }

    public showSetVarError() {
        if (this._setVarErrorHandler.error_msg) {
            this.sendEvent(
                "setVariableError",
                this._setVarErrorHandler.error_msg,
            )
        }
    }

    public step() {
        this.sendEvent("stopOnStep")
    }

    public endSession() {
        this.sendEvent("endSession")
    }

    public restart() {
        this.writeToChildProc(".debug restart\n", "ascii")
    }

    /**
     * gets variable from array of variables
     * @param varName name of variable to find
     * @param variables array of variables
     * @param hierarchyArr heirarchy of table field. Example: To change value of "tab.x.y", hierarchyArr will be ["tab", "x", "y"] in respective order,
     * for primitive type hierarchyArr will be undefined
     * @returns {RuntimeVariable | undefined } return RuntimeVariable if variable found, otherwise return undefined
     */
    public getRuntimeVariable(
        varName: string,
        variables: RuntimeVariable[],
        hierarchyArr?: string[],
    ): RuntimeVariable | undefined {
        let Var: RuntimeVariable | undefined
        variables.forEach((element) => {
            if (hierarchyArr) {
                if (
                    element.argumentList.length > 0 &&
                    element.argumentList[0] == hierarchyArr[0]
                ) {
                    let retVal = element
                    let i = 1
                    while (i < hierarchyArr.length) {
                        if (Array.isArray(retVal.value)) {
                            retVal.value.forEach((innerEle) => {
                                if (innerEle.name == hierarchyArr[i])
                                    retVal = innerEle
                                return
                            })
                        }
                        i++
                    }

                    if (
                        retVal &&
                        i == hierarchyArr.length &&
                        retVal.name == varName
                    ) {
                        Var = retVal
                        return
                    }
                }
            } else {
                if (element.name == varName) {
                    Var = element
                    return
                }
            }
        })
        return Var
    }

    /**
     * Retrieve global variables if globals is expanded
     */
    public globals(frameId: number): RuntimeVariable[] {
        const global_var: RuntimeVariable[] = []
        this._stacksInfo?.stacks[0].stack.forEach((element) => {
            const stackLevel = parseInt(element._attributes.level)
            if (parseInt(element._attributes.level) == frameId) {
                element.globals[0].global?.forEach((varItem) => {
                    this.convertVariables(
                        varItem._attributes,
                        global_var,
                        stackLevel,
                        "globals",
                    )
                })
                return
            }
        })
        return global_var
    }

    /**
     * Retrieves global variable
     * @param varName name of variable
     * @param hierarchyArr hierarchyArr of table fields. For "tab.x.y", argumentList will be ["tab", "x", "y"] in respective order,
     * for primitive type hierarchyArr will be undefined
     * @returns {GlobalVariableAttributes | undefined } globalVar if variable found, otherwise undefined
     */
    public global(
        varName: string,
        frameId: number,
        hierarchyArr?: string[],
    ): GlobalVariableAttributes | undefined {
        let globalVar: GlobalVariableAttributes | undefined = undefined
        let globalRv: RuntimeVariable | undefined
        const globalVariables = this.globals(frameId)
        if (globalVariables) {
            globalRv = this.getRuntimeVariable(
                varName,
                globalVariables,
                hierarchyArr,
            )
        }

        if (globalRv) {
            globalVar = {
                name: globalRv.name,
                value: String(globalRv.value),
                type: typeof globalRv.value,
                tableData: undefined,
            }
        }
        return globalVar
    }

    /**
     * Retrieve local variables if locals is expanded
     */
    public locals(frameId: number): RuntimeVariable[] {
        const localVariables: RuntimeVariable[] = []
        this._stacksInfo?.stacks[0].stack.forEach((element) => {
            const stackLevel = parseInt(element._attributes.level)
            if (stackLevel == frameId) {
                element.locals[0].local?.forEach((varItem) => {
                    this.convertVariables(
                        varItem._attributes,
                        localVariables,
                        stackLevel,
                        "locals",
                    )
                })
                return
            }
        })
        return localVariables
    }

    /**
     * Retrieves local variable
     * @param varName name of variable
     * @param hierarchyArr hierarchyArr of table fields. For "tab.x.y", argumentList will be ["tab", "x", "y"] in respective order,
     * for primitive type hierarchyArr will be undefined
     * @returns {LocalVariableAttributes | undefined } localVar if variable found, otherwise undefined
     */
    public local(
        varName: string,
        frameId: number,
        hierarchyArr?: string[],
    ): LocalVariableAttributes | undefined {
        let localVar: LocalVariableAttributes | undefined = undefined
        let localRv: RuntimeVariable | undefined
        const localVariables = this.locals(frameId)
        if (localVariables) {
            localRv = this.getRuntimeVariable(
                varName,
                localVariables,
                hierarchyArr,
            )
        }
        if (localRv) {
            localVar = {
                name: localRv.name,
                value: String(localRv.value),
                type: typeof localRv.value,
                tableData: undefined,
            }
        }
        return localVar
    }

    /**
     * Retrieve up value variables if upvalues is expanded
     */
    public upValues(frameId: number): RuntimeVariable[] {
        const upval_var: RuntimeVariable[] = []
        this._stacksInfo?.stacks[0].stack.forEach((element) => {
            const stackLevel = parseInt(element._attributes.level)
            if (parseInt(element._attributes.level) == frameId) {
                element.upvalues[0].upvalue?.forEach((varItem) => {
                    this.convertVariables(
                        varItem._attributes,
                        upval_var,
                        stackLevel,
                        "upvalues",
                    )
                })
                return
            }
        })
        return upval_var
    }

    /**
     * Retrieves up variable
     * @param varName name of variable
     * @param hierarchyArr hierarchyArr of table fields. For "tab.x.y", argumentList will be ["tab", "x", "y"] in respective order,
     * for primitive type hierarchyArr will be undefined
     * @returns {UpValueAttributes | undefined } upVar if variable found, otherwise undefined
     */
    public upValue(
        varName: string,
        frameId: number,
        hierarchyArr?: string[],
    ): UpValueAttributes | undefined {
        let upVar: UpValueAttributes | undefined = undefined
        let upRv: RuntimeVariable | undefined
        const upVariables = this.upValues(frameId)
        if (upVariables) {
            upRv = this.getRuntimeVariable(varName, upVariables, hierarchyArr)
        }

        if (upRv) {
            upVar = {
                name: upRv.name,
                value: String(upRv.value),
                type: typeof upRv.value,
                tableData: undefined,
            }
        }
        return upVar
    }

    /**
     * Takes raw variable data and parses to form an array of structured and simple variables
     *
     * @param attr - raw variable data to be checked against
     * @param var_collection - runtime variable array
     * @param stackLevel - stack frame level
     * @param scopeType - scope type of variable ["locals", "globals", "upvalues"]
     */
    private convertVariables(
        attr: VariableAttributes,
        var_collection: RuntimeVariable[],
        stackLevel: number,
        scopeType: string,
    ) {
        if (attr.tableData != undefined) {
            const res = JSON.parse(attr.tableData) as Root

            var_collection.push(
                this._tableParser.parseMainTable(
                    res,
                    String(attr.name),
                    stackLevel,
                    scopeType,
                ),
            )
        } else {
            const reg_var = new RuntimeVariable(attr.name)
            reg_var.value = attr.value
            reg_var.type = attr.type
            reg_var.stackLevel = stackLevel
            var_collection.push(reg_var)
        }
    }

    /** Sends an API call to clear all breakpoints */
    public clearBreakpoints() {
        this._debugChidProc.stdin.write(".debug clearBreakpoints\n")
    }

    /**
     * sends an API call to set a breakpoint
     * @param breakpoint - information of breakpoint to be set
     */
    public setBreakpoint(breakpoint: BreakPoint) {
        const breakpointStr = JSON.stringify(breakpoint)
        this._debugChidProc.stdin.write(
            ".debug setBreakpoint '" + breakpointStr + "'\n",
        )
    }

    /**
     * It makes a API call to ki-comms for setting variable
     * @param argList argList of table field. Example: To change value of "tab.x.y", argList will be ["tab", "x", "y"] in respective order,
     * for primitive type argList will be array with only one element array i.e name of the variable
     * @param value value of variable
     * @param scopeType scope type of variable
     */
    public setVariable(
        argList: string[],
        value: string,
        scopeType: string,
        frameId: number,
    ) {
        const varInfo: SetVariableInfo = {
            ArgumentList: argList,
            Value: value,
            StackLevel: frameId,
            Scope: scopeType,
        }

        const varInfoStr = JSON.stringify(varInfo)
        Log.trace(`.debug setVariable ${varInfoStr}`, {
            file: "tspRuntime.ts",
            func: "TspRuntime.setVariable()",
        })
        this._debugChidProc.stdin.write(
            ".debug setVariable '" + varInfoStr + "'\n",
        )
    }

    private sendEvent(event: string, ...args: string[]): void {
        setTimeout(() => {
            this.emit(event, ...args)
        }, 0)
    }
}
