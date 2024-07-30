import * as child from "child_process"
import path = require("path")
import { EventEmitter } from "events"
import fetch from "node-fetch"
import { EXECUTABLE } from "@tektronix/kic-cli"
import * as vscode from "vscode"
import { LOG_DIR } from "./utility"
import { LoggerManager } from "./logging"

export const CONNECTION_RE =
    /(?:([A-Za-z0-9_\-+.]*)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
//export const IPV4_ADDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/

export enum IoType {
    Lan = "Lan",
    Usb = "Usb",
}

export class InstrDetails {
    io_type: IoType
    friendly_name = ""
    model_serial = ""
    address = ""

    constructor(io_type: IoType) {
        this.io_type = io_type
    }
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
     * method checks if connection name entered is duplicate
     *
     * @param io_type - Lan, Usb etc.
     * @param model_serial - model and serial number of instrument
     * @param name - friendly name of instrument
     */
    public static checkForDuplicateFriendlyName(
        io_type: IoType,
        model_serial: string | undefined,
        name: string
    ): boolean {
        //true if duplicate friendly name is not entered
        let handled = true

        if (model_serial != undefined) {
            const connections: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []

            if (connections.length > 0) {
                connections.forEach((instr) => {
                    if (name == instr.friendly_name) {
                        if (
                            io_type === instr.io_type &&
                            model_serial ==
                                instr.model + "#" + instr.serial_number
                        ) {
                            //connecting to same instr with same friendly name, ignore
                            return
                        } else {
                            handled = false
                            void vscode.window.showErrorMessage(
                                "Duplicate name entered. Cannot proceed."
                            )
                            return
                        }
                    }
                })
            }
        }
        return handled
    }

    public static generateUniqueName(
        io_type: IoType,
        model_serial: string | undefined
    ): string {
        let unique_name = ""
        let found = false
        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        if (connections.length > 0) {
            connections.forEach((instr) => {
                if (
                    io_type === instr.io_type &&
                    model_serial == instr.model + "#" + instr.serial_number
                ) {
                    unique_name = instr.friendly_name
                    found = true
                    return
                }
            })
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

    /**
     * method checks and adds/updates new friendly name
     *
     * @param instr - instrument whose friendly name needs to be added/updated
     * @param new_name - friendly name of instrument
     */
    public static async checkandAddFriendlyName(
        instr: InstrInfo,
        new_name: string
    ) {
        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []
        const config = vscode.workspace.getConfiguration("tsp")

        const index = connections.findIndex(
            (i) =>
                i.io_type === instr.io_type &&
                instr.model == instr.model &&
                i.serial_number == i.serial_number
        )
        if (index !== -1) {
            //update
            if (connections[index].friendly_name != new_name) {
                connections[index].friendly_name = new_name
                await config.update(
                    "savedInstruments",
                    connections,
                    vscode.ConfigurationTarget.Global
                )
            }
        } else {
            connections.push(instr)
            await config.update(
                "savedInstruments",
                connections,
                vscode.ConfigurationTarget.Global
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
        maxerr?: number
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
    readonly kicList = new Array<KicCell>()
    public debugTermPid: Thenable<number | undefined> | undefined
    public doReconnect = false
    private _reconnectInstrDetails: ConnectionDetails | undefined
    public firstInstrDetails: ConnectionDetails | undefined
    private _connHelper: ConnectionHelper

    constructor(connHelper: ConnectionHelper) {
        this._connHelper = connHelper
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
    public createKicCell(
        name: string,
        unique_id: string,
        connType: string,
        maxerr?: number,
        filePath?: string
    ): string {
        const newCell = new KicCell()
        const info = newCell.initialiseComponents(
            name,
            unique_id,
            connType,
            maxerr,
            filePath
        )
        this.debugTermPid = newCell.terminalPid
        this.kicList.push(newCell)
        this.doReconnect = true

        // newCell.on("closeTerminal", () => {
        //     const idx = this.kicList.findIndex(
        //         (x) => x.terminalPid == newCell.terminalPid
        //     )
        //     this.kicList.splice(idx)
        // })
        return info
    }

    public restartConnectionAfterDebug() {
        if (this._reconnectInstrDetails != undefined) {
            this.createKicCell(
                this._reconnectInstrDetails.Name,
                this._reconnectInstrDetails.ConnAddr,
                this._reconnectInstrDetails.ConnType,
                this._reconnectInstrDetails.Maxerr
            )
        }
    }

    public async connDetailsForFirstInstr(): Promise<void> {
        //return new ConnectionDetails("", connAddr, connType)
        const options: vscode.InputBoxOptions = {
            prompt: "Enter instrument IP in <IP> format",
            validateInput: this._connHelper.instrIPValidator,
        }
        const ip = await vscode.window.showInputBox(options)
        if (ip === undefined) {
            return Promise.reject("connection unsuccessful.")
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

    /**
     * Used to create the components that establish communication with the instrument
     * */
    public initialiseComponents(
        name: string,
        unique_id: string,
        connType: string,
        maxerr?: number,
        filePath?: string
    ) {
        //#ToDo: need to verify if maxerr is required
        this._uniqueID = unique_id
        let info = ""
        this._connDetails = new ConnectionDetails(
            name,
            unique_id,
            connType,
            maxerr
        )
        const logger = LoggerManager.instance().add_logger("TSP Terminal")

        if (connType == "lan" && maxerr != undefined) {
            //getting instr info before we do the actual connection.

            info = child
                .spawnSync(
                    EXECUTABLE,
                    [
                        "--log-file",
                        path.join(
                            LOG_DIR,
                            `${new Date()
                                .toISOString()
                                .substring(0, 10)}-kic.log`
                        ),
                        "--log-socket",
                        `${logger.host}:${logger.port}`,
                        "info",
                        "lan",
                        "--json",
                        unique_id,
                    ],
                    {
                        env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
                    }
                )
                .stdout.toString()
            if (info == "") return info

            this._term = vscode.window.createTerminal({
                name: name,
                shellPath: EXECUTABLE,
                shellArgs: [
                    "--log-file",
                    path.join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`
                    ),
                    "--log-socket",
                    `${logger.host}:${logger.port}`,
                    "connect",
                    "lan",
                    unique_id,
                ],
                iconPath: vscode.Uri.file("/keithley-logo.ico"),
            })
        } else {
            this._term = vscode.window.createTerminal({
                name: name,
                shellPath: EXECUTABLE,
                shellArgs: [
                    "--log-file",
                    path.join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`
                    ),
                    "--log-socket",
                    `${logger.host}:${logger.port}`,
                    "connect",
                    "usb",
                    unique_id,
                ],
                iconPath: vscode.Uri.file("/keithley-logo.ico"),
            })
        }

        this.terminalPid = this._term.processId

        if (this._term != undefined) {
            this._term.show()
            if (filePath != undefined) {
                this._term.sendText(filePath)
            }
        }

        console.log(info)
        return info
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
        return Promise.reject("couldn't close terminal")
    }

    private sendEvent(event: string, ...args: string[]): void {
        setTimeout(() => {
            this.emit(event, ...args)
        }, 0)
    }

    public fetchConnAddr(): string {
        return this._uniqueID
    }

    public sendTextToTerminal(input: string) {
        this._term?.sendText(input)
    }

    public fetchConnDetials(): ConnectionDetails | undefined {
        return this._connDetails
    }
}

//Hosts multiple functions to help with creating connection with the instrument
export class ConnectionHelper {
    public IPTest(ip: string) {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
            ip
        )
    }
    public instrIPValidator = (val: string) => {
        let ip = val
        if (val.split("@").length > 1) {
            ip = val.split("@")[1]
        }
        if (this.IPTest(ip) == false) {
            return "Enter proper IPv4 address"
        }

        void this.getModelAndSerialNumber(ip).then((msn) => {
            if (msn != undefined) {
                void vscode.window.showInformationMessage(
                    ip +
                        ": Found instrument model " +
                        msn.model +
                        " with S/N: " +
                        msn.sn
                )
            }
        })
        return null
    }

    public myIPmap = new Map<
        string,
        { model: string; sn: string; port: string }
    >()

    public async getModelAndSerialNumber(
        ip: string
    ): Promise<{ model: string; sn: string; port: string } | undefined> {
        if (this.myIPmap.has(ip)) {
            return this.myIPmap.get(ip)
        }

        const read = async (body: NodeJS.ReadableStream) => {
            let error: string
            body.on("error", (err) => {
                error = err as string
            })
            let retbody = ""
            for await (const chunk of body) {
                retbody += chunk.toString()
            }

            return new Promise<string>((resolve, reject) => {
                body.on("close", () => {
                    error ? reject(error) : resolve(retbody)
                })
                return resolve(retbody)
            })
        }

        try {
            const response = await fetch("http://" + ip + "/lxi/identification")
            const body = await read(response.body)
            const model = body.split("</Model>")[0].split("<Model>")[1]
            const sn = body
                .split("</SerialNumber>")[0]
                .split("<SerialNumber>")[1]
            // const portSplit = body.split("::SOCKET")[0].split("::")
            const portNumber = "5025"
            // if (portSplit.length > 0) {
            //     portNumber = ":" + portSplit[portSplit.length - 1]
            // }

            const st = { model, sn, port: portNumber }
            this.myIPmap.set(ip, st)
            return st
        } catch (err) {
            console.log(err)
            return undefined
        }
    }

    //#Todo: has zero references -- needs cleanup?
    public createTerminal(
        kicProcessMgr: KicProcessMgr,
        instrumentIp?: string,
        usb_unique_string?: string,
        filePath?: string
    ) {
        const maxerr: number =
            vscode.workspace.getConfiguration("tsp").get("errorLimit") ?? 0
        if (instrumentIp != undefined) {
            const parts = instrumentIp.match(CONNECTION_RE)
            if (parts == null) return
            const name = typeof parts[1] == "undefined" ? "KIC" : parts[1]
            const ip_addr = parts[2]
            const ip = ip_addr.split(":")[0] //take only IPv4 address, don't include socket.

            /*
        //If for UX reason we need to have unique named terminals we can use this code
        if (this.checkForDuplicateTermName(name)) {
            void vscode.window.showWarningMessage(
                'Terminal name already exists, appending "(new)" to the name, please provide unique terminal names'
            )
            name += "(new)"
        }*/
            // term = vscode.window.createTerminal({
            //     name: name,
            //     shellPath: EXECUTABLE,
            //     shellArgs: [
            //         "connect",
            //         "lan",
            //         ip,
            //         "--max-errors",
            //         maxerr.toString(),
            //     ],
            //     iconPath: vscode.Uri.file("/keithley-logo.ico"),
            // })

            kicProcessMgr.createKicCell(name, ip, "lan", maxerr, filePath)
        } else if (usb_unique_string != undefined) {
            let unique_string = usb_unique_string
            let name = "KIC"
            const string_split = usb_unique_string.split("@")
            if (string_split.length > 1) {
                name = string_split[0]
                unique_string = string_split[1]
            }
            kicProcessMgr.createKicCell(
                name,
                unique_string,
                "usb",
                undefined,
                filePath
            )
        }

        // if (term != undefined) {
        //     term.show()
        //     if (filePath != undefined) {
        //         term.sendText(filePath)
        //     }
        // }
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
