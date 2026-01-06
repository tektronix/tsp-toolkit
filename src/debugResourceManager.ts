import { plainToInstance } from "class-transformer"
import * as xmlConvert from "xml-js"
import { DebugProtocol } from "@vscode/debugprotocol"
import { Log } from "./logging"

const READ_ONLY_DATA_TYPES = ["<TABLE>", "<FUNCTION>", "<THREAD>", "<USERDATA>"]
/**
 * This interface describes the tspdebug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the tsp-debug extension.
 * The interface should always match this schema.
 */

/** FrameAttributes maps oneToOne with the JSON structure of TspDebugger Stack object.
 */
interface FrameAttributes {
    /**level: It is call-stack level */
    level: string
    /**currentline: next line to be executed in the level*/
    currentline: string
    /**name: name of the function */
    name: string
}
/**Type of variables : Local | Global | Upvalue
 *
 * Each type of variable has same attributes as VariableAttributes
 *
 */
export interface VariableAttributes {
    /**name: variable name */
    name: string
    /**value: variable value */
    value: string
    /**type: variable type
     * ex. number | string | function | nil, etc
     */
    type: string

    tableData: string | undefined
}
/**LocalVariableAttributes has same interface as VariableAttributes */
export type LocalVariableAttributes = VariableAttributes
/**UpValueAttributes has same interface as VariableAttributes */
export type UpValueAttributes = VariableAttributes
/**GlobalVariableAttributes has same interface as VariableAttributes */
export type GlobalVariableAttributes = VariableAttributes

/**LocalVariable gets single instance of local variable with it's attributes */
export interface LocalVariable {
    _attributes: LocalVariableAttributes
}

/**LocalVariablesInfo get multiple instances of local variables */
interface LocalVariablesInfo {
    local: LocalVariable[]
}

/**An upvalue is associated with Closures.
 * Closure: A closure is a function that uses local variables from an outer function.
 *
 * "UpValue" gets single instance of upvalue variable with it's attributes */
export interface UpValue {
    _attributes: UpValueAttributes
}

/**UpValuesInfo get multiple instances of upvalue variables */
interface UpValuesInfo {
    upvalue: UpValue[]
}

/**GlobalVariable gets single instance of global variable with it's attributes */
export interface GlobalVariable {
    _attributes: GlobalVariableAttributes
}

/**GlobalVariablesInfo get multiple instances of global variables */
interface GlobalVariablesInfo {
    global: GlobalVariable[]
}

interface FrameInfo {
    _attributes: FrameAttributes
    // To accesss array of watchpoints, use watchpoints[0]
    watchpoints: WatchpointsInfo[]
    // To accesss array of global, use globals[0]
    globals: GlobalVariablesInfo[]
    // To accesss array of local, use lobals[0]
    locals: LocalVariablesInfo[]
    // To accesss array of upvalue, use lobals[0]
    upvalues: UpValuesInfo[]
}

/**StacksFramesInfo captures multiple instances of stack/frame */
interface StacksFramesInfo {
    stack: FrameInfo[]
}

/**StacksInfo caputres stacks.
 * Due to some limitation, it is an array now. so, stacks[0] will contain all
 * information of array of "stack"/frame.
 */
export class StacksInfo {
    // To accesss array of stack/frame, use stacks[0]
    stacks: StacksFramesInfo[] = []
}

/**Attributes for watchpoint
 */
export interface WatchpointAttributes {
    /**expression: expression to be evaluated */
    expression: string
    /**value: value of expression */
    value: string
    /**type: value type
     * ex. number | string etc.
     */
    type: string
}

/**Watchpoint gets single instance of watchpoint with it's attributes */
export interface Watchpoint {
    _attributes: WatchpointAttributes
}

/**WatchpointsInfo will get all watchpoints information
 * Due to some limitation, it is an array now. so, watchpoints[0] will contain all
 * information of array of "watchpoint".
 */
export class WatchpointsInfo {
    watchpoint: Watchpoint[] = []
}

export class BreakPoint {
    LineNumber: number
    Enable: boolean
    Condition: string

    constructor(lineNumber: number, enable: boolean, condition: string) {
        this.LineNumber = lineNumber
        this.Enable = enable
        this.Condition = condition
    }
}

export class DebugInfo {
    FileName: string
    BreakPoints: BreakPoint[] = []

    constructor(fileName: string, breakPoints: BreakPoint[]) {
        this.FileName = fileName
        this.BreakPoints = breakPoints
    }

    public addFileName(fileName: string) {
        this.FileName = fileName
    }

    public addBreakpoint(breakPoint: BreakPoint) {
        this.BreakPoints.push(breakPoint)
    }
}

export class RuntimeExceptionHandler {
    private input = ""
    private exceptionOccured = false
    private endReached = false
    public exceptionInfo = ""
    public exceptnInfoForUI: ExcepnDetailsForUI = new ExcepnDetailsForUI()
    private static readonly closing_tag =
        "</tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>"

    /**
     * Checks for any run-time exception that has occured
     *
     * @param chunk - debug data from kic executable
     */
    public checkForException(chunk: string) {
        this.input += chunk
        if (this.input.includes("execution-failed") && !this.exceptionOccured) {
            this.input = this.input.substring(
                this.input.indexOf("<execution-failed"),
            )
            this.exceptionOccured = true
        }

        if (
            this.exceptionOccured &&
            this.input.includes(RuntimeExceptionHandler.closing_tag)
        ) {
            this.input = this.input.substring(
                0,
                this.input.indexOf(RuntimeExceptionHandler.closing_tag),
            )
            this.endReached = true
        }

        /**
         * if run-time exception has occured and the exception data is procured
         * we convert that data to extract the exception info to be shown to the user
         */
        if (this.endReached) {
            //console.log("printing ---> ", this.output)

            /**
             * linefeed(&#x240a) and horizontal tabulation(&#x2409) is not converted as expected
             * and instead appear as LF and HT in the output after xml to js conversion
             * so as a workaround we are manually replaing them
             */
            this.input = this.input
                .replaceAll("&#x240a", "\n")
                .replaceAll("&#x2409", "    ")
            const js_output = xmlConvert.xml2js(this.input, {
                trim: true,
            })

            const result = plainToInstance(ExceptionInfo, js_output)

            this.parseExceptionForUI(result)

            // this.output = ""
            this.input = ""
            this.exceptionOccured = false
            this.endReached = false
        } else {
            this.exceptionInfo = ""
            this.exceptnInfoForUI = new ExcepnDetailsForUI()
        }
    }

    /**
     * Extracts exception description and call stack to update the UI
     *
     * @param result - object containg exception info that needs to be parsed
     */
    private parseExceptionForUI(result: ExceptionInfo) {
        this.exceptionInfo = result.elements[0].attributes.error

        const scriptName =
            '[string "' + result.elements[0].attributes.name + '"]'

        this.exceptionInfo = this.exceptionInfo.substring(
            0,
            this.exceptionInfo.indexOf("chunk"),
        )
        this.exceptionInfo = this.exceptionInfo
            .replaceAll(";", "")
            .replaceAll(scriptName, "")

        const regExp = new RegExp(/:\d+:/g)
        const exception_arr = this.exceptionInfo.split("\n")
        const exception_msg = exception_arr[0].replace(regExp, "")
        this.exceptnInfoForUI.Description = exception_msg

        exception_arr.splice(0, 3)

        let level = 0
        exception_arr.forEach((i) => {
            let lineNo = ""
            const output = i.match(regExp)
            if (output) {
                lineNo = output[0].replaceAll(":", "")
                this.exceptnInfoForUI.StackTrace.push({
                    CurrLine: lineNo,
                    Level: level.toString(),
                    Name: i.substring(i.indexOf("in ")),
                })
                level += 1
            }
        })
    }
}

class ExceptionInfo {
    elements: Element[] = []
}

interface Element {
    type: string
    name: string
    attributes: InnerException
}

interface InnerException {
    error: string
    name: string
}

export interface SetVariableInfo {
    /** name of variable to be set */
    ArgumentList: string[]
    /** value of variable */
    Value: string
    /** value of variable to be set in specific stack level */
    StackLevel: number
    /** type of the variable
     * Scope { "locals" | "globals" | "upvalues"}
     */
    Scope: string
}
export class ExcepnDetailsForUI {
    //Description of exception occured
    Description = ""
    StackTrace: ExcepnStackFrameForUI[] = []
}

class ExcepnStackFrameForUI {
    Level = ""
    CurrLine = ""
    Name = ""
}

/*
 * FrameInfo can have multiple properties, we need to obtain only scopes from the same,
 * hence we have a mapping which we check against
 */
export const ScopeMap = new Map<string, number>([
    ["globals", 1000],
    ["locals", 1001],
    ["upvalues", 1002],
])

/**
 * structure to hold the entire table
 */
export class Root {
    table: Table[] = []
}

/**
 * structure to hold the contents of table
 */
export interface Table {
    //name of the table
    name: string | number

    //content of the table
    value: number | string | boolean | Root
}

/**
 * variable type can be number, boolean, string or structured
 */
export type IRuntimeVariableType = number | boolean | string | RuntimeVariable[]

/**
 * Used to hold the variable and its parameters (name, value, type etc.)
 */
export class RuntimeVariable {
    public reference?: number
    public type?: string
    public value?: IRuntimeVariableType
    public stackLevel = -1
    public scope = ""
    public argumentList: string[] = []
    public presentationHint?: DebugProtocol.VariablePresentationHint

    constructor(public readonly name: string) {
        //
    }

    /**
     * Recursively extracts simple and structured variables
     *
     * @param input - can be string/boolean/number/table array
     * @param argumentList - heirarchy of table fields. For "tab.x.y", argumentList will be ["tab", "x", "y"] in respective order
     * @param stackLevel - stack frame level
     * @param scopeType - scope type of variable ["locals", "globals", "upvalues"]
     * value is not known during conversion from JSON to typescript object
     */
    public parseValue(
        input: unknown,
        argumentList: string[],
        stackLevel: number,
        scopeType: string,
    ) {
        this.scope = scopeType
        this.stackLevel = stackLevel
        if (
            typeof input === "string" ||
            typeof input === "number" ||
            typeof input === "boolean"
        ) {
            this.value = input
        } else {
            const op = input as Root
            const rv_arr: RuntimeVariable[] = []
            if (op.table.length > 0) {
                op.table.forEach((item) => {
                    rv_arr.push(
                        this.rVar(item, argumentList, stackLevel, scopeType),
                    )
                })
            }
            this.value = rv_arr
        }
    }

    private rVar(
        item: Table,
        argumentList: string[],
        stackLevel: number,
        scopeType: string,
    ): RuntimeVariable {
        let name = item.name
        let presentationHint:
            | DebugProtocol.VariablePresentationHint
            | undefined = undefined
        if (typeof item.name === "string") {
            name = '"' + item.name + '"'
            if (READ_ONLY_DATA_TYPES.includes(item.name.toUpperCase())) {
                presentationHint = { attributes: ["readOnly"] }
                name = item.name
            }
        }
        const rv = new RuntimeVariable(String(name))
        rv.argumentList = [...argumentList]
        rv.presentationHint = presentationHint
        rv.argumentList.push(String(name))
        rv.parseValue(item.value, rv.argumentList, stackLevel, scopeType)
        return rv
    }
}

/**
 * Contains method to identify when set variable error occurs and
 * parse it into user readable message
 */
export class setVariableErrorHandler {
    private output = ""
    private errorOccured = false
    private endReached = false
    public error_msg = ""

    /**
     * Checks for any error occured when user tries to change variable value
     *
     * @param input - debug data from kic executable
     */
    public checkForSetVarError(input: string) {
        if (input.includes("<SetVariable error")) {
            this.output = ""
            this.endReached = false
            this.errorOccured = false

            this.output = input.substring(input.indexOf("<SetVariable error"))
            this.errorOccured = true
        }

        if (
            this.errorOccured &&
            this.output.includes("/>") &&
            !this.endReached
        ) {
            this.output = this.output.substring(
                0,
                this.output.indexOf("/>") + 2,
            )
            this.endReached = true
        }

        if (this.errorOccured && !this.endReached) {
            if (input.includes("/>")) {
                this.output =
                    this.output + input.substring(0, input.indexOf("/>") + 2)
                this.endReached = true
            } else {
                if (!input.includes("SetVariable error")) {
                    this.output = this.output + input
                }
            }
        }

        if (this.endReached) {
            try {
                const js_output = xmlConvert.xml2js(this.output, {
                    trim: true,
                })
                const result = plainToInstance(ExceptionInfo, js_output)
                const regExp = new RegExp(/:\d+:/g)
                this.error_msg =
                    result.elements[0].attributes.error.split(regExp)[1]
            } catch (err: unknown) {
                Log.error(new String(err).toString(), {
                    file: "debugResourceManager.ts",
                    func: "setVariableErrorHandler.checkforSetVarError()",
                })
            }

            this.output = ""
            this.errorOccured = false
            this.endReached = false
        } else {
            this.error_msg = ""
        }
    }
}

/**
 * Used to construct the outermost table
 */
export class TableVarParser {
    constructor() {
        //
    }

    /**
     * Parses main table content and returns the result
     *
     * @param root - main table content that needs to be parsed for UI
     * @param mainTableName - name of outermost table
     * @param stackLevel - stack frame level
     * @param scopeType - scope type of variable ["locals", "globals", "upvalues"]
     * @returns - instance of runtime variable holding the entire table content
     */
    public parseMainTable(
        root: Root,
        mainTableName: string,
        stackLevel: number,
        scopeType: string,
    ): RuntimeVariable {
        const rv = new RuntimeVariable(mainTableName)
        rv.argumentList = ['"' + mainTableName + '"']
        rv.stackLevel = stackLevel
        rv.scope = scopeType
        const rvv: RuntimeVariable[] = []
        root.table.forEach((tabItem) => {
            let presentationHint:
                | DebugProtocol.VariablePresentationHint
                | undefined = undefined
            let name = tabItem.name
            if (typeof tabItem.name === "string") {
                name = '"' + tabItem.name + '"'
                if (READ_ONLY_DATA_TYPES.includes(tabItem.name.toUpperCase())) {
                    presentationHint = { attributes: ["readOnly"] }
                    name = tabItem.name
                }
            }
            const temp_rv = new RuntimeVariable(String(name))
            temp_rv.argumentList = [...rv.argumentList]
            temp_rv.presentationHint = presentationHint
            temp_rv.argumentList.push(String(name))
            temp_rv.stackLevel = stackLevel
            temp_rv.scope = scopeType
            temp_rv.parseValue(
                tabItem.value,
                temp_rv.argumentList,
                stackLevel,
                scopeType,
            )
            rvv.push(temp_rv)
        })

        rv.value = rvv
        return rv
    }
}
