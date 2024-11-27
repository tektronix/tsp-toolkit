import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as child from "node:child_process"
import { EventEmitter } from "node:events"
import * as vscode from "vscode"
import { EXECUTABLE } from "./kic-cli"
import { LOG_DIR } from "./utility"
import { Log, SourceLocation } from "./logging"
//import { LoggerManager } from "./logging"

export const CONNECTION_RE =
    /(?:([A-Za-z0-9_\-+.]*)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
//export const IPV4_ADDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/

//interface for *idn? response
export interface IIDNInfo {
    vendor: string
    model: string
    serial_number: string
    firmware_rev: string
}

export function idn_to_string(idn: IIDNInfo): string {
    return `${idn.vendor},${idn.model},${idn.serial_number},${idn.firmware_rev}`
}

export enum IoType {
    Lan = "Lan",
    Usb = "Usb",
    Visa = "Visa",
}

/**
 * io_type - Lan, Usb etc.
 * instr_address - connection address of instrument
 * instr_categ - versatest, tti, 26xx etc.
 */

interface IInstrInfo {
    io_type: IoType
    instr_address: string
    manufacturer: string
    model: string
    serial_number: string
    firmware_revision: string
    instr_categ: string
    socket_port?: string
}

export class InstrInfo implements IInstrInfo {
    io_type = IoType.Lan
    instr_address = ""
    manufacturer = ""
    model = ""
    serial_number = ""
    firmware_revision = ""
    instr_categ = ""
    friendly_name = ""
    socket_port?: string | undefined
}

//name: friendly name
//ip: address of instrument
export class FriendlyNameMgr {
    public static fetchConnListForPicker(): string[] {
        const conn_output: string[] = []

        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        connections.forEach((instr) => {
            conn_output.push(instr.friendly_name + "@" + instr.instr_address)
        })

        return conn_output
    }

    /**
     * method generates unique friendly name for instrument if user
     * does not provide one
     *
     * @param io_type - Lan, Usb etc.
     * @param model_serial - model and serial number of instrument
     * @returns - unique friendly name for given instrument
     */
    public static generateUniqueName(
        conn_type: string,
        model_serial: string | undefined,
    ): string {
        let unique_name = ""
        let found = false
        const io_type: IoType = FriendlyNameMgr.getIoType(conn_type)
        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        if (connections.length > 0) {
            for (let i = 0; i < connections.length; i++) {
                const instr = connections[i]
                if (
                    io_type === instr.io_type &&
                    model_serial == instr.model + "#" + instr.serial_number
                ) {
                    unique_name = instr.friendly_name
                    found = true
                    break
                }
            }
        }

        if (!found) {
            const baseString = model_serial ?? "instrument"
            let counter = 1
            let uniqueString = baseString

            while (connections.some((i) => i.friendly_name == uniqueString)) {
                uniqueString = baseString + "_" + String(counter)
                counter++
            }
            unique_name = uniqueString
        }
        return unique_name
    }

    private static getIoType(conn_type: string) {
        let io_type: IoType
        if (conn_type === "usb") {
            io_type = IoType.Usb
        } else if (conn_type === "lan") {
            io_type = IoType.Lan
        } else {
            io_type = IoType.Visa
        }
        return io_type
    }

    /**
     * method checks and adds/updates new friendly name
     *
     * @param instr - instrument whose friendly name needs to be added/updated
     * @param new_name - friendly name of instrument
     */
    public static async checkandAddFriendlyName(
        instr: InstrInfo,
        new_name: string,
    ) {
        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []
        const config = vscode.workspace.getConfiguration("tsp")

        const index = connections.findIndex(
            (i) =>
                i.io_type === instr.io_type &&
                i.model == instr.model &&
                i.serial_number == instr.serial_number,
        )
        if (index !== -1) {
            //update
            connections[index].friendly_name = new_name
            await config.update(
                "savedInstruments",
                connections,
                vscode.ConfigurationTarget.Global,
            )
        } else {
            connections.push(instr)
            await config.update(
                "savedInstruments",
                connections,
                vscode.ConfigurationTarget.Global,
            )
        }

        vscode.workspace.getConfiguration("tsp").get("savedInstruments")
    }
}

export class ConnectionDetails {
    Name: string
    ConnAddr: string
    ConnType: string
    Maxerr?: number

    constructor(
        name: string,
        connAddr: string,
        connType: string,
        maxerr?: number,
    ) {
        this.Name = name
        this.ConnAddr = connAddr
        this.ConnType = connType
        this.Maxerr = maxerr
    }
}

/**
 * Initiates and manages instrument connections
 */
export class KicProcessMgr {
    //kicList holds the up to date instrument connections
    private _kicList = new Array<KicCell>()
    public debugTermPid: Thenable<number | undefined> | undefined
    public doReconnect = false
    private _reconnectInstrDetails: ConnectionDetails | undefined
    public firstInstrDetails: ConnectionDetails | undefined
    private _connHelper: ConnectionHelper

    constructor(connHelper: ConnectionHelper) {
        this._connHelper = connHelper
    }

    async dispose(): Promise<void> {
        const LOGLOC = {
            file: "resourceManager.ts",
            func: "KicProcessMgr.dispose()",
        }
        Log.trace("Disposing KicProcessMgr...", LOGLOC)
        for (const k of this._kicList) {
            Log.trace(`Killing ${await k.terminalPid}: ${k.connAddr}`, LOGLOC)
            await k.dispose()
        }

        Log.trace("KicProcessMgr Disposed...", LOGLOC)
    }

    public get kicList(): Array<KicCell> {
        return this._kicList
    }

    /**
     * Used to establish a connection with an instrument
     *
     * @param name - name of the connection terminal
     * @param unique_id - unique id referring to the instrument
     * @param connType - connection type (usb, lan etc.)
     * @param maxerr - maximum error
     * @param filePath - file path of tsp file to be executed on the instrument
     */
    public async createKicCell(
        name: string,
        unique_id: string,
        connType: string,
        maxerr?: number,
        filePath?: string,
    ): Promise<[info: string, verified_name?: string]> {
        const LOGLOC: SourceLocation = {
            file: "resourceManager.ts",
            func: `KicProcessMgr.createKicCell("${name}", "${unique_id}", "${connType}", "${maxerr ?? ""}", "${filePath ?? ""}")`,
        }
        Log.trace("Creating Kic Cell", LOGLOC)
        const newCell = new KicCell()
        const [info, verified_name] = await newCell.initializeComponents(
            name,
            unique_id,
            connType,
            maxerr,
            filePath,
        )
        this.debugTermPid = newCell.terminalPid
        this._kicList.push(newCell)
        this.doReconnect = true

        return [info, verified_name]
    }

    public async restartConnectionAfterDebug() {
        if (this._reconnectInstrDetails != undefined) {
            try {
                await this.createKicCell(
                    this._reconnectInstrDetails.Name,
                    this._reconnectInstrDetails.ConnAddr,
                    this._reconnectInstrDetails.ConnType,
                    this._reconnectInstrDetails.Maxerr,
                )
            } catch (error) {
                const details = `Unable to reconnect after debugging: ${error?.toString()}`
                Log.error(details, {
                    file: "resourceManager.ts",
                    func: "restartConnectionAfterDebug",
                })
                console.error(details)
            }
        }
    }

    public async connDetailsForFirstInstr(): Promise<void> {
        //return new ConnectionDetails("", connAddr, connType)
        const options: vscode.InputBoxOptions = {
            prompt: "Enter instrument IP in <IP> format",
            validateInput: this._connHelper.instrConnectionStringValidator,
        }
        const ip = await vscode.window.showInputBox(options)
        if (ip === undefined) {
            return Promise.reject(new Error("connection unsuccessful."))
        }
        this.doReconnect = false

        if (this._connHelper.IPTest(ip) == false) {
            this.firstInstrDetails = new ConnectionDetails("", ip, "usb")
        } else {
            this.firstInstrDetails = new ConnectionDetails("", ip, "lan")
        }
    }
}

export class KicCell extends EventEmitter {
    private _term: vscode.Terminal | undefined
    public terminalPid: Thenable<number | undefined> | undefined
    private _uniqueID = ""
    private _connDetails: ConnectionDetails | undefined
    public isTerminalClosed = false
    private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    constructor() {
        super()
    }

    async dispose(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "resourceManager.ts",
            func: "KicCell.dispose()",
        }
        const pid = await this._term?.processId
        if (pid !== undefined) {
            Log.trace(
                `Killing PID ${pid}, connection to ${this.connAddr}`,
                LOGLOC,
            )
            process.kill(pid)
        }
        this._term?.dispose()
        this.reset()
    }

    private reset() {
        const LOGLOC: SourceLocation = {
            file: "resourceManager.ts",
            func: "KicCell.reset()",
        }
        if (this._connDetails) {
            Log.debug(
                `Resetting instrument at ${this._connDetails.ConnAddr}`,
                LOGLOC,
            )
            child.spawnSync(EXECUTABLE, [
                "--log-file",
                join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`,
                ),
                "reset",
                this._connDetails.ConnType,
                this._connDetails.ConnAddr,
            ])
        }
    }

    /**
     * Used to create the components that establish communication with the instrument
     * */
    public async initializeComponents(
        name: string,
        unique_id: string,
        connType: string,
        maxerr?: number,
        filePath?: string,
    ): Promise<[info: string, verified_name?: string]> {
        //#ToDo: need to verify if maxerr is required
        const LOGLOC: SourceLocation = {
            file: "resourceManager.ts",
            func: `KicCell.initializeComponents("${name}", "${unique_id}", "${connType}", "${maxerr ?? ""}", "${filePath ?? ""}")`,
        }
        return await vscode.window.withProgress(
            {
                cancellable: false,
                location: vscode.ProgressLocation.Notification,
                title: "Connecting to instrument",
            },
            (progress) => {
                Log.trace("Initializing components", LOGLOC)
                this._uniqueID = unique_id
                let info = ""
                let verified_name: string | undefined = undefined
                this._connDetails = new ConnectionDetails(
                    name,
                    unique_id,
                    connType,
                    maxerr,
                )

                //TODO Get tsp.dumpQueueOnConnect setting
                let dump_path: string | undefined = undefined
                if (
                    vscode.workspace
                        .getConfiguration("tsp")
                        .get("dumpQueueOnConnect")
                ) {
                    progress.report({
                        message: "Dumping data from instrument output queue",
                    })
                    Log.info(
                        "Dumping data from instrument output queue",
                        LOGLOC,
                    )
                    const dump_dir = mkdtempSync(join(tmpdir(), "tsp-toolkit-"))
                    dump_path = join(dump_dir, "dump-output")

                    Log.trace(`Dumping data to ${dump_path}`, LOGLOC)

                    const dump_proc = child.spawnSync(EXECUTABLE, [
                        "--log-file",
                        join(
                            LOG_DIR,
                            `${new Date().toISOString().substring(0, 10)}-kic.log`,
                        ),
                        "dump",
                        connType,
                        unique_id,
                        "--output",
                        dump_path,
                    ])
                    Log.trace(
                        `Dump process exited with code: ${dump_proc.status}}`,
                        LOGLOC,
                    )
                }

                progress.report({
                    message: "Getting instrument information",
                })
                Log.trace("Getting instrument information", LOGLOC)
                const info_proc = child.spawnSync(
                    EXECUTABLE,
                    [
                        "--log-file",
                        join(
                            LOG_DIR,
                            `${new Date().toISOString().substring(0, 10)}-kic.log`,
                        ),
                        "info",
                        connType,
                        "--json",
                        unique_id,
                    ],
                    {
                        env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
                    },
                )
                const exit_code = info_proc.status

                info = info_proc.stdout.toString()

                Log.trace(
                    `Info process exited with code: ${exit_code}, information: ${info.trim()}`,
                    LOGLOC,
                )

                if (info == "") return new Promise((resolve) => resolve([info]))

                const _info = <IIDNInfo>JSON.parse(info)
                // void vscode.window.showInformationMessage(
                //     unique_id +
                //         ": Found instrument model " +
                //         _info.model +
                //         " with S/N: " +
                //         _info.serial_number,
                // )

                if (name == "") {
                    verified_name = FriendlyNameMgr.generateUniqueName(
                        connType,
                        _info.model + "#" + _info.serial_number,
                    )
                    name = verified_name
                    this._connDetails.Name = name
                    Log.trace(`Set name to "${name}"`, LOGLOC)
                }

                const terminal_args = [
                    "--log-file",
                    join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`,
                    ),
                    "connect",
                    connType,
                    unique_id,
                ]

                if (dump_path) {
                    Log.trace(`Showing dump content from ${dump_path}`, LOGLOC)
                    terminal_args.push("--dump-output", dump_path)
                }

                progress.report({
                    message: `Connecting to instrument with model ${_info.model} and S/N ${_info.serial_number}`,
                })

                Log.trace("Starting VSCode Terminal", LOGLOC)
                this._term = vscode.window.createTerminal({
                    name: name,
                    shellPath: EXECUTABLE,
                    shellArgs: terminal_args,
                    isTransient: true, // Don't try to reinitialize the terminal when restarting vscode
                    iconPath: {
                        light: vscode.Uri.file(
                            join(
                                __dirname,
                                "..",
                                "resources",
                                "light",
                                "tsp-terminal-icon.svg",
                            ),
                        ),
                        dark: vscode.Uri.file(
                            join(
                                __dirname,
                                "..",
                                "resources",
                                "dark",
                                "tsp-terminal-icon.svg",
                            ),
                        ),
                    },
                })

                vscode.window.onDidCloseTerminal((t) => {
                    Log.info("Terminal closed", LOGLOC)
                    if (
                        t.creationOptions.iconPath !== undefined &&
                        // eslint-disable-next-line @typescript-eslint/no-base-to-string
                        t.creationOptions.iconPath
                            .toString()
                            .search("tsp-terminal-icon") &&
                        t.exitStatus !== undefined &&
                        t.exitStatus.reason !==
                            vscode.TerminalExitReason.Process
                    ) {
                        setTimeout(() => {
                            Log.trace("Resetting closed instrument", LOGLOC)
                            this.reset()
                        }, 500)
                    }
                })

                this.terminalPid = this._term?.processId

                if (this._term != undefined) {
                    this._term.show()
                    if (filePath != undefined) {
                        this._term.sendText(filePath)
                    }
                }

                console.log(info)
                Log.trace(`Connected to ${info.trim()}`, LOGLOC)

                progress.report({
                    message: `Connected to instrument with model ${_info.model} and S/N ${_info.serial_number}`,
                })
                return new Promise((resolve) => resolve([info, verified_name]))
            },
        )
    }

    public async getTerminalState(): Promise<string> {
        const max_attempts = 60
        for (let i = 0; i < max_attempts; i++) {
            if (this.isTerminalClosed == true) {
                return Promise.resolve("terminal is closed")
            } else {
                await this.sleep(500)
            }
        }
        return Promise.reject(new Error("couldn't close terminal"))
    }

    private sendEvent(event: string, ...args: string[]): void {
        setTimeout(() => {
            this.emit(event, ...args)
        }, 0)
    }

    public get connAddr(): string {
        return this._uniqueID
    }

    public sendTextToTerminal(input: string) {
        this._term?.sendText(input)
    }

    public get connDetails(): ConnectionDetails | undefined {
        return this._connDetails
    }
}

//Hosts multiple functions to help with creating connection with the instrument
export class ConnectionHelper {
    public IPTest(ip: string) {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
            ip,
        )
    }
    public VisaResourceStringTest(val: string): boolean {
        return /^(visa:\/\/.*\/)?((TCPIP|USB|GPIB|ASRL|FIREWIRE|GPIB-VXI|PXI|VXI)\d*)::.*/.test(
            val,
        )
    }
    public instrConnectionStringValidator = (val: string) => {
        let conn_str = val
        if (val.split("@").length > 1) {
            conn_str = val.split("@")[1]
        }
        if (!this.IPTest(conn_str) && !this.VisaResourceStringTest(conn_str)) {
            return "Enter proper IPv4 address or VISA resource string"
        }
        return null
    }
}

/**
 * Generic class to contain debug related variables
 */
export class DebugHelper {
    /**
     * Since we need to access the active file when the user clicks
     * the debug button, we have created the debuggeeFilePath property
     * which is set to vscode active text editor file (.tsp file)
     * when the user clicks on debug button and the
     * same file is used till end of that debug session
     */
    public static debuggeeFilePath: string | undefined
}
