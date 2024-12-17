import * as os from "os"
import * as child from "child_process"
import { join } from "path"

import * as vscode from "vscode"
import {
    JSONRPC,
    JSONRPCClient,
    JSONRPCRequest,
    JSONRPCResponse,
} from "json-rpc-2.0"
import { plainToInstance } from "class-transformer"
import { DISCOVER_EXECUTABLE, EXECUTABLE } from "./kic-cli"
import {
    idn_to_string,
    IIDNInfo,
    InstrInfo,
    IoType,
    KicProcessMgr,
} from "./resourceManager"
import { LOG_DIR } from "./utility"
import { Log, SourceLocation } from "./logging"

const DISCOVERY_TIMEOUT = 2

let nextID = 0
const createID = () => nextID++

const instr_map = new Map<string, string>()
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

const rpcClient: JSONRPCClient = new JSONRPCClient(
    (jsonRPCRequest) =>
        fetch("http://localhost:3030/", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(jsonRPCRequest),
        }).then((response) => {
            if (response.status === 200) {
                // Use client.receive when you received a JSON-RPC response.
                return response
                    .json()
                    .then((jsonRPCResponse) =>
                        rpcClient.receive(jsonRPCResponse as JSONRPCResponse),
                    )
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            } else if (jsonRPCRequest.id !== undefined) {
                return Promise.reject(new Error(response.statusText))
            }
        }),
    createID,
)

const jsonRPCRequest: JSONRPCRequest = {
    jsonrpc: JSONRPC,
    id: createID(),
    method: "get_instr_list",
}

/**
 * The possible statuses of a connection interface/protocol
 */
export enum ConnectionStatus {
    /**
     * This instrument is ignored. This variant should not be used for interfaces
     */
    Ignored,
    /**
     * This connection interface was deemed inactive and will not respond to connection attempts
     */
    Inactive,
    /**
     * This connection interface was deemed active and will respond to connection attempts
     */
    Active,
    /**
     * This connection interface was deemed connected and already has a terminal associated with it
     */
    Connected,
}

function connectionStatusIcon(status: ConnectionStatus): vscode.ThemeIcon {
    switch (status) {
        case ConnectionStatus.Inactive:
            return new vscode.ThemeIcon(
                "vm-outline",
                new vscode.ThemeColor("list.deemphasizedForeground"),
            )
        case ConnectionStatus.Active:
            return new vscode.ThemeIcon(
                "vm-active",
                new vscode.ThemeColor("progressBar.background"),
            )
        case ConnectionStatus.Connected:
            return new vscode.ThemeIcon(
                "vm-running",
                new vscode.ThemeColor("testing.iconPassed"),
            )
    }

    return new vscode.ThemeIcon("warning")
}

/**
 * A tree item that holds the details of an instrument connection interface/protocol
 */
export class Connection extends vscode.TreeItem {
    private _type: IoType = IoType.Lan
    private _addr: string = ""
    private _status: ConnectionStatus = ConnectionStatus.Inactive

    private _onChangedStatus = new vscode.EventEmitter<ConnectionStatus>()

    readonly onChangedStatus: vscode.Event<ConnectionStatus> =
        this._onChangedStatus.event

    static from(info: InstrInfo) {
        return new Connection(info.io_type, info.instr_address)
    }

    constructor(conn_type: IoType, addr: string) {
        super(addr, vscode.TreeItemCollapsibleState.None)
        this._type = conn_type
        this._addr = addr
        this.iconPath = connectionStatusIcon(this._status)
    }

    get type(): IoType {
        return this._type
    }

    get addr(): string {
        return this._addr
    }

    get status(): ConnectionStatus {
        return this._status
    }

    set status(status: ConnectionStatus) {
        this.iconPath = connectionStatusIcon(status)
        let changed = false
        if (this._status != status) {
            changed = true
        }
        this._status = status
        switch (this._status) {
            case ConnectionStatus.Active:
                this.command = {
                    title: "Connect",
                    command: "tsp.openTerminalIP",
                    arguments: [this],
                    tooltip: "Connect to this interface",
                }
                break
            case ConnectionStatus.Inactive:
                this.command = undefined
                break
            case ConnectionStatus.Connected:
                this.command = undefined
                break
        }

        if (changed) {
            this._onChangedStatus.fire(this._status)
        }
    }

    async getUpdatedStatus(): Promise<void> {
        return new Promise((resolve) => {
            // TODO: This shouldn't use info for TCPIP. Or the kic info command needs to
            // use the instrument lxi page for anything on TCPIP/LAN
            const background_process = child.spawn(
                EXECUTABLE,
                [
                    "--log-file",
                    join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`,
                    ),
                    "info",
                    this.type.toLowerCase(),
                    "--json",
                    this.addr,
                ],
                {
                    env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
                },
            )

            setTimeout(() => {
                if (os.platform() === "win32" && background_process.pid) {
                    // The following was the only configuration of options found to work.
                    // Do NOT remove the `/F` unless you have rigorously proven that it
                    // consistently works.
                    child.spawnSync("TaskKill", [
                        "/PID",
                        background_process.pid.toString(),
                        "/T", // Terminate the specified process and any child processes
                        "/F", // Forcefully terminate the specified processes
                    ])
                } else {
                    background_process.kill("SIGINT")
                }
            }, 1000)

            let changes = false
            background_process?.on("close", () => {
                const new_status =
                    background_process.exitCode === 0
                        ? ConnectionStatus.Active
                        : ConnectionStatus.Inactive
                if (this.status !== new_status) {
                    this.status = new_status
                    changes = true
                }
                if (changes) {
                    this._onChangedStatus.fire(this.status)
                }
                resolve()
            })
        })
    }
}

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
 * Information describing an instrument that is either saved or discovered.
 */
export class Instrument extends vscode.TreeItem {
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

    static from(info: InstrInfo) {
        const n = new Instrument(
            {
                firmware_rev: info.firmware_revision,
                model: info.model,
                serial_number: info.serial_number,
                vendor: info.manufacturer,
            },
            info.friendly_name.length == 0 ? undefined : info.friendly_name,
        )
        n._category = info.instr_categ
        n._connections.push(Connection.from(info))

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
        if (instr_map.get(this._info.model) === "versatest") {
            this.contextValue += "Versatest"
        } else {
            this.contextValue += "Reg"
        }
        this.contextValue += "Inactive"
        this.contextValue += "Discovered"
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
            (v) => v.addr === connection.addr && v.type == connection.type,
        )
        if (i > -1) {
            if (this._connections[i].status !== connection.status) {
                this._connections[i].status = connection.status
                this._onChanged.fire()
            }
            return false
        }
        connection.onChangedStatus(() => this.updateStatus())
        this._connections.push(connection)

        this._onChanged.fire()

        return true
    }

    hasConnection(connection: Connection) {
        const i = this._connections.findIndex(
            (v) => v.addr === connection.addr && v.type == connection.type,
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
        this._connections.sort((a, b) => -(a.status - b.status))

        for (const c of this._connections) {
            if (c.status == ConnectionStatus.Active) {
                this._status = ConnectionStatus.Active //If at least one connection is active, we show "Active"
            } else if (c.status == ConnectionStatus.Connected) {
                this._status = ConnectionStatus.Connected

                break //If any of the connections are connected, we show "Connected"
            }
        }

        this.iconPath = connectionStatusIcon(this._status)

        if (this._status != status_before) {
            this._onChanged.fire()
            switch (this._status) {
                case ConnectionStatus.Active:
                    this.contextValue = this.contextValue?.replace(
                        /Connected|Active|Inactive/,
                        "Active",
                    )
                    break
                case ConnectionStatus.Inactive:
                    this.contextValue = this.contextValue?.replace(
                        /Connected|Active|Inactive/,
                        "Inactive",
                    )
                    break
                case ConnectionStatus.Connected:
                    this.contextValue = this.contextValue?.replace(
                        /Connected|Active|Inactive/,
                        "Connected",
                    )
                    break
                    break
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

export class InstrumentTreeDataProvider
    implements
        vscode.TreeDataProvider<
            Instrument | Connection | InactiveInstrumentList | StringData
        >
{
    private _instruments: Instrument[] = []
    private instruments_discovered: boolean = false
    private _savedInstrumentConfigWatcher: vscode.Disposable | undefined =
        undefined

    constructor() {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.constructor()",
        }
        Log.debug("Instantiating InstrumentTreeDataProvider", LOGLOC)
        this.getSavedInstruments().catch(() => {})
        this.configWatcherEnable(true)
    }

    private async updateSavedAll(instruments: Instrument[]) {
        for (const i of instruments) {
            await this.updateSaved(i)
        }
    }
    /**
     * If the given instrument exists in the saved instrument list, add entries for any
     * missing connections.
     */
    async updateSaved(instrument: Instrument) {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.updateSaved()",
        }

        Log.trace(
            `Updating saved instrument with sn ${instrument.info.serial_number}`,
            LOGLOC,
        )
        // Get all the saved entries
        const raw: InstrInfo[] =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        // Find all saved entries that have the same SN as the given instrument
        const matches = raw.filter(
            (v) => v.serial_number === instrument.info.serial_number,
        )

        // Of all the connections in the given instrument, find the ones that aren't in
        // the other list
        const missing = instrument.connections.filter(
            (v) => !matches.find((m) => m.instr_address === v.addr),
        )

        for (const m of missing) {
            raw.push({
                io_type: m.type,
                instr_address: m.addr,
                manufacturer: instrument.info.vendor,
                model: instrument.info.model,
                serial_number: instrument.info.serial_number,
                firmware_revision: instrument.info.firmware_rev,
                instr_categ: instrument.category,
                friendly_name: instrument.name,
            })
        }

        for (const r of raw) {
            if (r.serial_number === instrument.info.serial_number) {
                if (r.friendly_name !== instrument.name) {
                    r.friendly_name = instrument.name
                }
                if (r.firmware_revision !== instrument.info.firmware_rev) {
                    r.firmware_revision = instrument.info.firmware_rev
                }
            }
        }

        if (matches.length > 0) {
            await vscode.workspace
                .getConfiguration("tsp")
                .update(
                    "savedInstruments",
                    raw,
                    vscode.ConfigurationTarget.Global,
                )
        }
    }

    addOrUpdateInstruments(instruments: Instrument[]) {
        for (const i of instruments) {
            this.addOrUpdateInstrument(i)
        }
    }

    addOrUpdateInstrument(instrument: Instrument) {
        // const LOGLOC: SourceLocation = {
        //     file: "instruments.ts",
        //     func: `InstrumentTreeDataProvider.addOrUpdateInstrument()`,
        // }

        const found_idx = this._instruments.findIndex(
            (v) =>
                v.info.model === instrument.info.model &&
                v.info.serial_number === instrument.info.serial_number,
        )

        let changed = false
        if (found_idx > -1) {
            for (const c of instrument.connections) {
                changed = this._instruments[found_idx].addConnection(c)
                if (
                    this._instruments[found_idx].name != instrument.name &&
                    !this._instruments[found_idx].saved
                ) {
                    this._instruments[found_idx].name = instrument.name
                    changed = true
                }
                if (changed) {
                    this._instruments[found_idx].updateStatus()
                }
            }
        } else {
            instrument.onChanged(() => this.reloadTreeData())
            this._instruments.push(instrument)
            changed = true
        }

        this.reloadTreeData()
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        | void
        | Instrument
        | Connection
        | InactiveInstrumentList
        | StringData
        | (Instrument | Connection | InactiveInstrumentList | StringData)[]
        | null
        | undefined
    > = new vscode.EventEmitter<
        | void
        | Instrument
        | Connection
        | InactiveInstrumentList
        | StringData
        | (Instrument | Connection | InactiveInstrumentList | StringData)[]
        | null
        | undefined
    >()

    readonly onDidChangeTreeData: vscode.Event<
        | void
        | Instrument
        | Connection
        | InactiveInstrumentList
        | StringData
        | (Instrument | Connection | InactiveInstrumentList | StringData)[]
        | null
        | undefined
    > = this._onDidChangeTreeData.event

    getTreeItem(
        element: Instrument | Connection | InactiveInstrumentList | StringData,
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(
        element?:
            | Instrument
            | Connection
            | InactiveInstrumentList
            | StringData
            | undefined,
    ): vscode.ProviderResult<
        (Instrument | Connection | InactiveInstrumentList | StringData)[]
    > {
        // const LOGLOC: SourceLocation = {
        //     file: "instruments.ts",
        //     func: `InstrumentTreeDataProvider.getChildren()`,
        // }
        if (!element) {
            return new Promise((resolve) => {
                resolve([
                    ...this._instruments.filter(
                        (x) =>
                            x.status == ConnectionStatus.Active ||
                            x.status == ConnectionStatus.Connected,
                    ),
                    new InactiveInstrumentList(),
                ])
            })
        }
        if (element instanceof Instrument) {
            return new Promise((resolve) => {
                resolve([...element.connections])
            })
        }

        if (element instanceof InfoList) {
            return new Promise((resolve) => {
                if (!element.info) {
                    resolve([])
                } else {
                    resolve([
                        new StringData(`Model: ${element.info.model}`),
                        new StringData(
                            `FW Version: ${element.info.firmware_rev}`,
                        ),
                        new StringData(
                            `Serial Number: ${element.info.serial_number}`,
                        ),
                    ])
                }
            })
        }
        if (element instanceof Connection) {
            return new Promise((resolve) => {
                resolve([])
            })
        }
        if (element instanceof InactiveInstrumentList) {
            return new Promise((resolve) => {
                resolve([
                    ...this._instruments.filter(
                        (x) =>
                            x.status == ConnectionStatus.Inactive ||
                            x.status == ConnectionStatus.Ignored,
                    ),
                ])
            })
        }
        return new Promise((resolve) => {
            resolve([])
        })
    }

    doWithConfigWatcherOff(cb: () => void) {
        this.configWatcherEnable(false)
        cb()
        this.configWatcherEnable(true)
    }
    private configWatcherEnable(enabled: boolean) {
        if (enabled && !this._savedInstrumentConfigWatcher) {
            this._savedInstrumentConfigWatcher =
                vscode.workspace.onDidChangeConfiguration((e) => {
                    if (e.affectsConfiguration("tsp.savedInstrument")) {
                        this.getSavedInstruments().catch(() => {})
                    }
                })
        } else if (!enabled && this._savedInstrumentConfigWatcher) {
            this._savedInstrumentConfigWatcher.dispose()
            this._savedInstrumentConfigWatcher = undefined
        }
    }

    async refresh(discovery_cb: () => Promise<void>): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.refresh()",
        }

        Log.trace("Refreshing Discovered list", LOGLOC)
        await this.updateStatus()
        await discovery_cb()

        this.doWithConfigWatcherOff(() => {
            this.updateSavedAll(this._instruments).catch(() => {})
        })

        this.instruments_discovered = false
    }

    async saveInstrument(instr: Instrument): Promise<void> {
        //TODO Add to saved list
        instr.saved = true
        await this.saveInstrumentToList(instr)
        this.reloadTreeData()
    }

    async removeInstrument(instr: Instrument): Promise<void> {
        Log.trace(`Remove ${instr.info.serial_number}`, {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.removeInstrument()",
        })
        await this.removeSavedList(instr)
        this.reloadTreeData()
    }

    reloadTreeData() {
        // Sort the connections by name
        this._instruments.sort((a, b) => a.name.localeCompare(b.name))
        // Sort the connections by status
        // (we want to show higher values first, so invert the result)
        this._instruments.sort((a, b) => -(a.status - b.status))
        this._onDidChangeTreeData.fire(undefined)
    }

    private async getSavedInstruments(): Promise<Instrument[]> {
        return new Promise(() => {
            const raw: InstrInfo[] =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []

            this.addOrUpdateInstruments(
                raw.map((v) => {
                    const i = Instrument.from(v)
                    i.saved = true
                    return i
                }),
            )

            return this._instruments
        })
    }

    private async updateStatus(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.updateStatus()",
        }
        Log.trace("UpdateStatus", LOGLOC)
        const parallel_info: Promise<void>[] = []
        for (let i = 0; i < this._instruments.length; i++) {
            Log.trace(
                `Checking connections for ${this._instruments[i].name}`,
                LOGLOC,
            )
            parallel_info.push(this._instruments[i].getUpdatedStatus())
        }
        await Promise.all(parallel_info)
        return new Promise((resolve) => {
            resolve()
        })
    }

    /**
     * @returns true when new instruments are discovered
     */
    async getContent(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            rpcClient.requestAdvanced(jsonRPCRequest).then(
                (jsonRPCResponse: JSONRPCResponse) => {
                    if (jsonRPCResponse.error) {
                        reject(
                            new Error(
                                `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`,
                            ),
                        )
                        console.log(
                            `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`,
                        )
                    } else {
                        this.addOrUpdateInstruments(
                            InstrumentTreeDataProvider.parseDiscoveredInstruments(
                                jsonRPCResponse,
                            ).map((v: InstrInfo) => {
                                this.instruments_discovered = true
                                const i = Instrument.from(v)
                                i.connections[0].status =
                                    ConnectionStatus.Active
                                i.updateStatus()
                                return i
                            }),
                        )

                        if (this.instruments_discovered) {
                            this.reloadTreeData()
                        }
                    }

                    //DEBUG
                    //DEBUG
                    //DEBUG
                    // const example = new Instrument(
                    //     {
                    //         vendor: "KEITHLEY INSTRUMENTS LLC",
                    //         firmware_rev: "0.0.1eng1165-230e88a",
                    //         model: "TSPop",
                    //         serial_number: "0",
                    //     },
                    //     "2461#04090044",
                    // )
                    // const example_conn_lan = new Connection(
                    //     IoType.Lan,
                    //     "127.0.0.1",
                    // )
                    // example_conn_lan.status = ConnectionStatus.Active

                    // example.addConnection(example_conn_lan)
                    // example.updateStatus()
                    // this.addOrUpdateInstrument(example)
                    //DEBUG
                    //DEBUG
                    //DEBUG

                    resolve(this.instruments_discovered)
                },
                () => {
                    reject(new Error("RPC Instr List Fetch failed!"))
                    console.log("RPC Instr List Fetch failed!")
                },
            )
            //todo
        })
    }

    /**
     * Used to parse the discovered instrument details and create a list for the same
     *
     * @param jsonRPCResponse - json rpc response whose result needs to be parsed
     * to extract the discovered instrument details
     */
    private static parseDiscoveredInstruments(
        jsonRPCResponse: JSONRPCResponse,
    ): InstrInfo[] {
        const discovery_list: InstrInfo[] = []
        const res: unknown = jsonRPCResponse.result
        if (typeof res === "string") {
            console.log("JSON RPC Instr list: " + res)
            const instrList = res.split("\n")

            //need to remove the last newline element??
            instrList?.forEach((instr) => {
                let new_instr: InstrInfo | undefined = undefined
                if (instr.length > 0) {
                    const obj = plainToInstance(InstrInfo, JSON.parse(instr))
                    //console.log(obj.fetch_uid())

                    if (discovery_list.length == 0) {
                        discovery_list.push(obj)
                    } else {
                        let idx = -1
                        new_instr = undefined

                        for (let i = 0; i < discovery_list.length; i++) {
                            new_instr = undefined
                            if (
                                DiscoveryHelper.createUniqueID(
                                    discovery_list[i],
                                ) == DiscoveryHelper.createUniqueID(obj)
                            ) {
                                if (
                                    discovery_list[i].instr_address !=
                                    obj.instr_address
                                ) {
                                    idx = i
                                    new_instr = obj
                                    break
                                } else {
                                    break
                                }
                            } else {
                                new_instr = obj
                            }
                        }

                        if (new_instr != undefined) {
                            if (idx > -1) {
                                discovery_list[idx] = new_instr
                            } else {
                                discovery_list.push(new_instr)
                            }
                        }
                    }
                }
            })
        }
        return discovery_list
    }

    private static getAllIndices(
        list: Array<InstrInfo>,
        pred: (item: InstrInfo) => boolean,
    ): number[] {
        const indices: Array<number> = new Array<number>()
        for (let i = 0; i < list.length; i++) {
            if (pred(list[i])) {
                indices.push(i)
            }
        }
        return indices
    }
    private async removeSavedList(instr: Instrument) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.removeInstrument()",
        }
        try {
            const instrList: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")

            const matching_instruments_indices =
                InstrumentTreeDataProvider.getAllIndices(instrList, (v) => {
                    return (
                        v.model == instr.info.model &&
                        v.serial_number == instr.info.serial_number
                    )
                })
            Log.trace(
                `Removing ${matching_instruments_indices.length} instances of ${instr.info.serial_number}`,
                LOGLOC,
            )

            for (const idx of matching_instruments_indices.reverse()) {
                Log.trace(`Removing ${JSON.stringify(instrList[idx])}`, LOGLOC)
                instrList.splice(idx, 1)
            }

            await config.update(
                "savedInstruments",
                instrList,
                vscode.ConfigurationTarget.Global,
            )
        } catch (err_msg) {
            vscode.window.showErrorMessage(String(err_msg))
        }
    }
    private async saveInstrumentToList(instr: Instrument) {
        try {
            const instrList: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")

            for (const i of instr.connections) {
                const matching_instruments_indices =
                    InstrumentTreeDataProvider.getAllIndices(instrList, (v) => {
                        return (
                            v.model == instr.info.model &&
                            v.serial_number == instr.info.serial_number &&
                            v.io_type == i.type &&
                            (i.type == IoType.Visa
                                ? v.instr_address.substring(0, 4) ==
                                  i.addr.substring(0, 4)
                                : true)
                        )
                    })
                if (matching_instruments_indices.length == 0) {
                    instrList.push({
                        io_type: i.type,
                        instr_address: i.addr,
                        manufacturer: instr.info.vendor,
                        model: instr.info.model,
                        serial_number: instr.info.serial_number,
                        firmware_revision: instr.info.firmware_rev,
                        instr_categ: instr_map.get(instr.info.model) ?? "",
                        friendly_name: instr.name,
                        socket_port: i.type == IoType.Lan ? "5025" : undefined,
                    })
                } else {
                    for (const m of matching_instruments_indices) {
                        if (
                            instrList[m].io_type == IoType.Visa &&
                            instrList[m].instr_address.substring(0, 4) ==
                                i.addr.substring(0, 4)
                        ) {
                            instrList[m].instr_address = i.addr
                        } else {
                            instrList[m].instr_address = i.addr
                        }
                    }
                }
            }
            await config.update(
                "savedInstruments",
                instrList,
                vscode.ConfigurationTarget.Global,
            )
        } catch (err_msg) {
            vscode.window.showErrorMessage(String(err_msg))
        }
    }
}

export class InstrumentsExplorer {
    private InstrumentsDiscoveryViewer: vscode.TreeView<
        Instrument | Connection | InactiveInstrumentList
    >
    private treeDataProvider?: InstrumentTreeDataProvider
    private intervalID?: NodeJS.Timeout
    private _kicProcessMgr: KicProcessMgr
    private _discoveryInProgress: boolean = false

    constructor(
        context: vscode.ExtensionContext,
        kicProcessMgr: KicProcessMgr,
    ) {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentExplorer.constructor()",
        }
        this._kicProcessMgr = kicProcessMgr

        Log.trace("Instantiating TDP", LOGLOC)
        const treeDataProvider = new InstrumentTreeDataProvider()
        Log.trace("Refreshing TDP", LOGLOC)
        treeDataProvider
            .refresh(async () => await this.startDiscovery())
            .catch((e) => {
                Log.error(
                    `Problem starting Instrument List data provider: ${e}`,
                    LOGLOC,
                )
            })

        this.InstrumentsDiscoveryViewer = vscode.window.createTreeView<
            Instrument | Connection | InactiveInstrumentList
        >("InstrumentsExplorer", {
            treeDataProvider,
        })

        this.InstrumentsDiscoveryViewer.message =
            "Checking saved instrument connections..."

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.InstrumentsDiscoveryViewer.message =
                "Checking saved instrument connections..."
            this.treeDataProvider
                ?.refresh(async () => {
                    await this.startDiscovery()
                })
                .then(
                    () => {},
                    (e) => {
                        Log.error(`Unable to refresh instrument explorer: ${e}`)
                    },
                )
        })
        vscode.commands.registerCommand(
            "InstrumentsExplorer.openInstrumentsDiscoveryResource",
            () => void 0,
        )
        vscode.commands.registerCommand(
            "InstrumentsExplorer.revealResource",
            () => void 0,
        )

        const upgradeFw = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeFirmware",
            async (e: Connection) => {
                await this.upgradeFirmware(e)
            },
        )

        const upgradeMainframe = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeMainframe",
            async (e: Connection) => {
                await this.upgradeMainframe(e)
            },
        )

        const upgradeSlot1 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot1",
            async (e: Connection) => {
                await this.upgradeSlot1(e)
            },
        )

        const upgradeSlot2 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot2",
            async (e: Connection) => {
                await this.upgradeSlot2(e)
            },
        )

        const upgradeSlot3 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot3",
            async (e: Connection) => {
                await this.upgradeSlot3(e)
            },
        )

        const saveInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.save",
            async (e: Instrument) => {
                console.log(e)
                await this.saveInstrument(e)
            },
        )

        const removeInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.remove",
            async (e: Instrument) => {
                await this.removeInstrument(e)
            },
        )

        context.subscriptions.push(upgradeFw)
        context.subscriptions.push(upgradeMainframe)
        context.subscriptions.push(upgradeSlot1)
        context.subscriptions.push(upgradeSlot2)
        context.subscriptions.push(upgradeSlot3)
        context.subscriptions.push(saveInstrument)
        context.subscriptions.push(removeInstrument)

        this.treeDataProvider
            ?.refresh(async () => await this.startDiscovery())
            .then(
                () => {},
                (e: Error) => {
                    Log.error(`Unable to start Discovery ${e.message}`, LOGLOC)
                },
            )
    }

    private startDiscovery(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentExplorer.startDiscovery()",
        }
        return new Promise<void>((resolve) => {
            if (!this._discoveryInProgress) {
                this._discoveryInProgress = true
                const discover = child.spawn(
                    DISCOVER_EXECUTABLE,
                    [
                        "--log-file",
                        join(
                            LOG_DIR,
                            `${new Date()
                                .toISOString()
                                .substring(0, 10)}-kic-discover.log`,
                        ),
                        "all",
                        "--timeout",
                        DISCOVERY_TIMEOUT.toString(),
                        "--exit",
                    ],
                    //,
                    // {
                    //     detached: true,
                    //     stdio: "ignore",
                    // }
                )

                discover.on("exit", (code) => {
                    if (code) {
                        Log.trace(`Discover Exit Code: ${code}`, LOGLOC)
                    }
                    this.InstrumentsDiscoveryViewer.message = ""
                    clearInterval(this.intervalID)
                    this._discoveryInProgress = false
                    resolve()
                })

                //subprocess.unref()

                this.InstrumentsDiscoveryViewer.message =
                    "Discovering new instrument connections..."

                //this.treeDataProvider?.clear()

                this.intervalID = setInterval(() => {
                    this.treeDataProvider?.getContent().then(
                        () => {},
                        () => {},
                    )
                }, 1000)
            }
        })
    }

    public async rename(item: Instrument) {
        //if (typeof item === typeof InstrDiscoveryNode) {
        const name = await vscode.window.showInputBox({
            placeHolder: "Enter new name",
        })
        if (
            name !== null &&
            name !== undefined &&
            name.length > 0 &&
            item !== undefined
        ) {
            Log.trace(`Changing name from ${item.name} to ${name}`, {
                file: "instruments.ts",
                func: "InstrumentsExplorer.rename()",
            })
            item.name = name
            this.treeDataProvider?.addOrUpdateInstrument(item)
            this.treeDataProvider?.doWithConfigWatcherOff(() => {
                this.treeDataProvider?.updateSaved(item).catch(() => {})
            })
        } else {
            Log.warn("Item not defined", {
                file: "instruments.ts",
                func: "InstrumentsExplorer.rename()",
            })
        }
    }

    public reset(item: Connection) {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })

        if (kicTerminals.length == 0 && item != undefined) {
            //reset using the "kic reset" command
            const connectionType = item.type
            console.log("Connection address: " + item.addr)

            //Start the connection process to reset
            //The process is expected to exit after sending the cli reset command
            child.spawn(EXECUTABLE, [
                "--log-file",
                join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`,
                ),
                "reset",
                connectionType.toLowerCase(),
                item.addr,
            ])
        } else {
            //Use the existing terminal to reset
            for (const kicCell of this._kicProcessMgr.kicList) {
                if (item != undefined) {
                    if (item.addr == kicCell.connAddr) {
                        kicCell.sendTextToTerminal(".reset\n")
                    }
                }
            }
        }
    }

    private async upgradeFirmware(e: Connection) {
        await this.genericUpgradeFW(e, 0)
    }

    public async saveWhileConnect(instrument: Instrument) {
        await this.treeDataProvider?.saveInstrument(instrument)
    }

    private async saveInstrument(instr: Instrument) {
        await this.treeDataProvider?.saveInstrument(instr)
    }

    //from connect

    private async removeInstrument(instr: Instrument) {
        instr.saved = false
        await this.treeDataProvider?.removeInstrument(instr)
    }

    private async upgradeMainframe(e: Connection) {
        await this.genericUpgradeFW(e, 0)
    }

    private async upgradeSlot1(e: Connection) {
        await this.genericUpgradeFW(e, 1)
    }

    private async upgradeSlot2(e: Connection) {
        await this.genericUpgradeFW(e, 2)
    }

    private async upgradeSlot3(e: Connection) {
        await this.genericUpgradeFW(e, 3)
    }

    /**
     * Common method to upgrade firmware/mainframe/slots
     * @param _e - tree item showing the menu
     * @param is_module - whether instrument contains a module or not
     * @param slot - the slot to upgrade if any
     */
    private async genericUpgradeFW(e: Connection, slot = 0) {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })
        if (kicTerminals.length == 0) {
            void vscode.window.showInformationMessage(
                "Not connected to any instrument. Cannot proceed.",
            )
            return
        } else {
            for (const kicCell of this._kicProcessMgr.kicList) {
                if (e != undefined) {
                    if (e.addr == kicCell.connAddr) {
                        const fw_file = await vscode.window.showOpenDialog({
                            filters: {
                                "All files (*.*)": ["*"],
                            },
                            canSelectFolders: false,
                            canSelectFiles: true,
                            canSelectMany: false,
                            openLabel: "Select firmware file to upgrade ...",
                        })

                        if (!fw_file || fw_file.length < 1) {
                            return
                        } else {
                            // .update "path" --slot {number}
                            kicCell.sendTextToTerminal(
                                `.upgrade "${fw_file[0].fsPath}" --slot ${slot}\n
                                `,
                            )
                        }
                        return
                    }
                }
            }
        }
    }
}

class DiscoveryHelper {
    public static createUniqueID(info: InstrInfo): string {
        let res = ""
        res = info.io_type.toString() + ":" + this.createModelSerial(info)
        return res
    }

    public static createModelSerial(info: InstrInfo): string {
        let res = ""
        res = info.model + "#" + info.serial_number
        return res
    }
}
