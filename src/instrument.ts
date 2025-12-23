import * as vscode from "vscode"
import { idn_to_string, IIDNInfo, InstrInfo } from "./resourceManager"
import {
    Connection,
    ConnectionStatus,
    connectionStatusIcon,
    contextValueStatus,
} from "./connection"

export const instr_map = new Map<string, string>()
instr_map.set("2601", "non_nimitz")
instr_map.set("2602", "non_nimitz")
instr_map.set("2611", "non_nimitz")
instr_map.set("2612", "non_nimitz")
instr_map.set("2635", "non_nimitz")
instr_map.set("2636", "non_nimitz")
instr_map.set("2601A", "non_nimitz")
instr_map.set("2602A", "non_nimitz")
instr_map.set("2611A", "non_nimitz")
instr_map.set("2612A", "non_nimitz")
instr_map.set("2635A", "non_nimitz")
instr_map.set("2636A", "non_nimitz")
instr_map.set("2651A", "non_nimitz")
instr_map.set("2657A", "non_nimitz")
instr_map.set("2601B", "non_nimitz")
instr_map.set("2601B-PULSE", "non_nimitz")
instr_map.set("2602B", "non_nimitz")
instr_map.set("2606B", "non_nimitz")
instr_map.set("2611B", "non_nimitz")
instr_map.set("2612B", "non_nimitz")
instr_map.set("2635B", "non_nimitz")
instr_map.set("2636B", "non_nimitz")
instr_map.set("2604B", "non_nimitz")
instr_map.set("2614B", "non_nimitz")
instr_map.set("2614B", "non_nimitz")
instr_map.set("2634B", "non_nimitz")
instr_map.set("2601B-L", "non_nimitz")
instr_map.set("2602B-L", "non_nimitz")
instr_map.set("2611B-L", "non_nimitz")
instr_map.set("2612B-L", "non_nimitz")
instr_map.set("2635B-L", "non_nimitz")
instr_map.set("2636B-L", "non_nimitz")
instr_map.set("2604B-L", "non_nimitz")
instr_map.set("2614B-L", "non_nimitz")
instr_map.set("2634B-L", "non_nimitz")
instr_map.set("3706-SNFP", "non_nimitz")
instr_map.set("3706-S", "non_nimitz")
instr_map.set("3706-NFP", "non_nimitz")
instr_map.set("3706A", "non_nimitz")
instr_map.set("3706A-SNFP", "non_nimitz")
instr_map.set("3706A-S", "non_nimitz")
instr_map.set("3706A-NFP", "non_nimitz")
instr_map.set("707B", "non_nimitz")
instr_map.set("708B", "non_nimitz")
instr_map.set("5880-SRU", "non_nimitz")
instr_map.set("5881-SRU", "non_nimitz")
instr_map.set("2450", "nimitz")
instr_map.set("2470", "nimitz")
instr_map.set("DMM7510", "nimitz")
instr_map.set("2460", "nimitz")
instr_map.set("2461", "nimitz")
instr_map.set("2461-SYS", "nimitz")
instr_map.set("DMM7512", "nimitz")
instr_map.set("DMM6500", "nimitz")
instr_map.set("DAQ6510", "nimitz")
instr_map.set("VERSATEST-300", "versatest")
instr_map.set("VERSATEST-600", "versatest")
instr_map.set("MP5103", "versatest")
instr_map.set("TSP", "versatest")
instr_map.set("TSPop", "versatest")

/**
 * A class used to indicate the start of the Inactive Instruments section of the instrument
 * list. This class stores no data and is simply a sentinel.
 */
export class InactiveInstrumentList extends vscode.TreeItem {
    constructor() {
        super("Offline Instruments", vscode.TreeItemCollapsibleState.Collapsed)
    }
}

/**
 * A class used to indicate the start of the Ignored Instruments section of the instrument
 * list. This class stores no data and is simply a sentinel.
 */
export class IgnoredInstruments extends vscode.TreeItem {
    constructor() {
        super("Ignored Instruments", vscode.TreeItemCollapsibleState.Collapsed)
    }
}

/**
 * Information describing an instrument that is either saved or discovered.
 */
export class Instrument extends vscode.TreeItem implements vscode.Disposable {
    private _name: string = ""
    private _connections: Connection[] = []
    private _info: IIDNInfo = {
        vendor: "",
        model: "",
        serial_number: "",
        firmware_rev: "",
    }
    private _status = ConnectionStatus.Inactive
    private _category: string = ""

    private _onChanged = new vscode.EventEmitter<void>()

    readonly onChanged: vscode.Event<void> = this._onChanged.event
    private _saved: boolean = false
    private _savingOutput: boolean = false

    static from(info: InstrInfo) {
        const n = new Instrument(
            {
                firmware_rev: info.firmware_revision,
                model: info.model,
                serial_number: info.serial_number,
                vendor: info.manufacturer,
            },
            info.friendly_name.length === 0 ? undefined : info.friendly_name,
        )
        n._category = info.instr_categ
        n.addConnection(Connection.from(info))

        return n
    }

    constructor(info: IIDNInfo, name?: string) {
        if (!name) {
            name = `${info.model}#${info.serial_number}`
        }
        super(name, vscode.TreeItemCollapsibleState.Expanded)
        this.description = idn_to_string(info)
        this._info = info
        this._name = name
        this.tooltip = new vscode.MarkdownString(
            [
                `* Manufacturer: ${info.vendor}`,
                `* Model: ${info.model}`,
                `* Serial Number: ${info.serial_number}`,
                `* Firmware Rev: ${info.firmware_rev}`,
            ].join("\n"),
        )
        this.contextValue = "Instr"
        this._category = instr_map.get(this._info.model) ?? ""
        if (this._category === "versatest") {
            this.contextValue += "Versatest"
        } else {
            this.contextValue += "Reg"
        }
        this.contextValue += "Inactive"
        this.saved = false
    }
    dispose() {
        for (const c of this._connections) {
            c.dispose()
        }
    }

    get name(): string {
        return this._name
    }

    set name(name: string) {
        this._name = name
        this.label = this._name
        this._onChanged.fire()
    }

    get info(): IIDNInfo {
        return this._info
    }

    get category(): string {
        return this._category
    }

    get connections(): Connection[] {
        return this._connections
    }

    get savingTspOutput(): boolean {
        return this._savingOutput
    }

    set savingTspOutput(enable: boolean) {
        if (this.contextValue?.match(/Saving/)) {
            if (!enable) {
                this.contextValue = this.contextValue?.replace(/Saving/, "")
                this._onChanged.fire()
                console.log(
                    `contextValue contains 'Saving', removing: ${this.contextValue}`,
                )
            }
        } else {
            if (enable) {
                this.contextValue += "Saving"
                this._onChanged.fire()
                console.log(
                    `contextValue doesn't contain 'Saving', adding: ${this.contextValue}`,
                )
            }
        }
    }

    async sendScript(filepath: string) {
        const connection = this._connections.find(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (!connection) {
            return
        }
        await connection.sendScript(filepath)
    }
    async startSaveTspOutput() {
        this.savingTspOutput = true
        let connection = this._connections.find(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (!connection) {
            const label: string | undefined = await vscode.window.showQuickPick(
                this._connections.map((c) => c.label?.toString() ?? ""),
                { canPickMany: false, title: "Which connection?" },
            )

            if (!label) {
                return
            }

            connection = this._connections.find(
                (x) => (x.label?.toString() ?? "") === label,
            )

            if (!connection) {
                vscode.window.showErrorMessage(
                    "Unable to find selected connection",
                )
                return
            }
        }
        const output = await vscode.window.showSaveDialog({
            title: "Select Output File",
        })
        if (!output) {
            this.savingTspOutput = false
            return
        }

        await connection.startTspOutputSaving(output.fsPath)
    }

    stopSaveTspOutput() {
        this.savingTspOutput = false
        const connection = this._connections.find(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (!connection) {
            return
        }
        connection.stopTspOutputSaving()
    }

    async saveBufferContents() {
        let connection = this._connections.find(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (!connection) {
            const label: string | undefined = await vscode.window.showQuickPick(
                this._connections.map((c) => c.label?.toString() ?? ""),
                { canPickMany: false, title: "Which connection?" },
            )

            if (!label) {
                return
            }

            connection = this._connections.find(
                (x) => (x.label?.toString() ?? "") === label,
            )

            if (!connection) {
                vscode.window.showErrorMessage(
                    "Unable to find selected connection",
                )
                return
            }
        }
        const buffers = (
            await vscode.window.showInputBox({
                title: "Buffer Variable Names",
                prompt: "Enter the buffer variable names separated by a comma (',')",
                placeHolder: "buf1,buf2,buf2,...",
            })
        )
            ?.split(",")
            .map((s) => s.trim())
        const delimiter = await vscode.window.showInputBox({
            title: "Delimiter",
            prompt: "Enter the string you want to separate each data field",
            placeHolder: ",",
        })
        const fields = await vscode.window.showQuickPick(
            [
                "timestamps",
                "readings",
                "measurefunctions",
                "measureranges",
                "sourcefunctions",
                "sourceoutputstates",
                "sourceranges",
                "sourcevalues",
                "statuses",
            ],
            { canPickMany: true, title: "Fields to print" },
        )
        const output = await vscode.window.showSaveDialog({
            title: "Select Output File",
        })
        if (!output || !buffers || !delimiter || !fields) {
            return
        }
        await connection.saveBufferContents(
            buffers,
            fields,
            delimiter,
            output.fsPath,
        )
    }

    async upgrade(): Promise<void> {
        let connection = this._connections.find(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (!connection) {
            const label: string | undefined = await vscode.window.showQuickPick(
                this._connections.map((c) => c.label?.toString() ?? ""),
                { canPickMany: false, title: "Which connection?" },
            )

            if (!label) {
                return
            }

            connection = this._connections.find(
                (x) => (x.label?.toString() ?? "") === label,
            )

            if (!connection) {
                vscode.window.showErrorMessage(
                    "Unable to find selected connection",
                )
                return
            }
        }

        let slot: number | undefined = undefined
        if (this._category === "versatest") {
            let num_slots = 0
            switch (this._info.model) {
                case "MP5103":
                    num_slots = 3
                    break
                case "TSPop":
                    num_slots = 3
                    break
            }
            const slot_str = await vscode.window.showQuickPick(
                [
                    "Mainframe",
                    ...[...Array(num_slots + 1).keys()]
                        .slice(1)
                        .map((n) => `Slot ${n}`),
                ],
                { canPickMany: false, title: "What do you want to upgrade?" },
            )
            if (!slot_str) {
                return
            }

            if (slot_str === "Mainframe") {
                slot = undefined
            } else {
                slot = parseInt(slot_str.substring("Slot ".length))
            }
        }

        const file = await vscode.window.showOpenDialog({
            title: "Select Firmware File",
            filters: {
                "Firmware Files": ["x", "upg"],
            },
            openLabel: "Upgrade",
        })
        if (!file) {
            return
        }

        await connection.upgrade(file[0].fsPath, slot)
    }

    /**
     * Gets the ConnectionStatus of the instrument by calling `this.updateStatus`.
     * @see updateStatus()
     */
    get status(): ConnectionStatus {
        return this.updateStatus()
    }

    /**
     * @param connection A new connection interface to add to this instrument
     */
    addConnection(connection: Connection): boolean {
        const i = this._connections.findIndex(
            (v) => v.addr === connection.addr && v.type === connection.type,
        )
        if (i > -1) {
            if (
                connection.status !== undefined &&
                this._connections[i].status !== connection.status
            ) {
                this._connections[i].status = connection.status
                //this._onChanged.fire()
            }
            return false
        }
        connection.onChangedStatus(() => {
            this.updateStatus()
        }, this)

        connection.parent = this
        this._connections.push(connection)

        this._onChanged.fire()

        return true
    }

    hasConnection(connection: Connection) {
        const i = this._connections.findIndex(
            (v) => v.addr === connection.addr && v.type === connection.type,
        )
        return i > -1
    }

    /**
     * Check all connections to see if they are responsive. Can be run concurrently with
     * other instrument checks.
     */
    async getUpdatedStatus(): Promise<void> {
        for (const c of this._connections) {
            await c.getUpdatedStatus()
        }
    }

    /**
     * Update the status of this Instrument by going through each connection interface
     * and then determining the overall status of this instrument:
     *
     * @returns ConnectionStatus.Connected if any connections are Connected.
     * @returns ConnectionStatus.Active if no connections are Connected but at least 1 is Active.
     * @returns ConnectionStatus.Inactive otherwise.
     */
    updateStatus(): ConnectionStatus {
        const status_before = this._status
        this._status = ConnectionStatus.Inactive

        // Sort the connections by address
        this._connections.sort((a, b) => a.addr.localeCompare(b.addr))
        // Sort the connections by status
        // (we want to show higher values first, so invert the result)
        this._connections.sort((a, b) => {
            const a_status = a.status ?? ConnectionStatus.Inactive
            const b_status = b.status ?? ConnectionStatus.Inactive
            return -(a_status - b_status)
        })

        for (const c of this._connections) {
            if (c.status === ConnectionStatus.Active) {
                this._status = ConnectionStatus.Active //If at least one connection is active, we show "Active"
            } else if (c.status === ConnectionStatus.Connected) {
                this._status = ConnectionStatus.Connected

                break //If any of the connections are connected, we show "Connected"
            }
        }

        this.iconPath = connectionStatusIcon(this._status)

        if (this._status !== status_before) {
            this.contextValue = contextValueStatus(
                this.contextValue ?? "Instr",
                this._status,
            )
            this._onChanged.fire()
        }

        if (this._status === ConnectionStatus.Connected) {
            this._connections
                .filter((c) => c.status !== ConnectionStatus.Connected)
                .map((c) => c.enable(false))
        } else {
            for (const c of this._connections) {
                c.enable(true)
            }
        }

        return this._status
    }

    get saved(): boolean {
        return this._saved
    }

    set saved(enabled: boolean) {
        this._saved = enabled
        const str = enabled ? "Saved" : "Discovered"
        if (this.contextValue?.match(/Saved|Discovered/)) {
            this.contextValue = this.contextValue?.replace(
                /Saved|Discovered/,
                str,
            )
        } else {
            this.contextValue += str
        }
    }

    rename() {}
}

export class InfoList extends vscode.TreeItem {
    private _info?: IIDNInfo | undefined
    constructor(info: IIDNInfo) {
        super(
            "Instrument Information",
            vscode.TreeItemCollapsibleState.Collapsed,
        )
        this._info = info
    }

    get info(): IIDNInfo | undefined {
        return this._info
    }
}

export class StringData extends vscode.TreeItem {
    constructor(text: string) {
        super(text, vscode.TreeItemCollapsibleState.None)
    }
}
