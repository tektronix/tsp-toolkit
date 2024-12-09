import * as cp from "node:child_process"
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

const DISCOVERY_TIMEOUT = 5

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
    /**
     * This instrument is ignored. This variant should not be used for interfaces
     */
    Ignored,
}

/**
 * A tree item that holds the details of an instrument connection interface/protocol
 */
export class Connection extends vscode.TreeItem {
    private _type: IoType = IoType.Lan
    private _addr: string = ""
    private _status: ConnectionStatus = ConnectionStatus.Inactive

    constructor(conn_type: IoType, addr: string) {
        super(addr, vscode.TreeItemCollapsibleState.None)
        this._type = conn_type
        this._addr = addr
        this.iconPath = new vscode.ThemeIcon("pass")
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
        switch (status) {
            case ConnectionStatus.Inactive:
                this.iconPath = new vscode.ThemeIcon("warning")
                break
            case ConnectionStatus.Active:
                this.iconPath = new vscode.ThemeIcon("pass")
                break
            case ConnectionStatus.Connected:
                this.iconPath = new vscode.ThemeIcon("pass-filled")
                break
        }
        this._status = status
    }
}

/**
 * An Iterable list of connection interfaces
 */
export class ConnectionList
    extends vscode.TreeItem
    implements Iterable<Connection, unknown, unknown>
{
    private connection_set: Set<Connection> = new Set()
    constructor(iterable?: Iterable<Connection> | null | undefined) {
        super("Available Connections", vscode.TreeItemCollapsibleState.Expanded)
        this.connection_set = new Set(iterable)
    }

    [Symbol.iterator](): Iterator<Connection, unknown, unknown> {
        return this.connection_set[Symbol.iterator]()
    }

    as_array(): Connection[] {
        return Array.from(this.connection_set.values())
    }

    add(connection: Connection) {
        this.connection_set.add(connection)
    }

    get set(): Set<Connection> {
        return this.connection_set
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
    private _connections: ConnectionList = new ConnectionList()
    private _info: IIDNInfo = {
        vendor: "",
        model: "",
        serial_number: "",
        firmware_rev: "",
    }

    static fromInstrInfo(info: InstrInfo) {
        return new Instrument(
            {
                firmware_rev: info.firmware_revision,
                model: info.model,
                serial_number: info.serial_number,
                vendor: info.manufacturer,
            },
            info.firmware_revision.length == 0
                ? undefined
                : info.firmware_revision,
        )
    }

    constructor(info: IIDNInfo, name?: string) {
        if (!name) {
            name = `${info.model}#${info.serial_number}`
        }
        super(name, vscode.TreeItemCollapsibleState.Collapsed)
        this.description = idn_to_string(info)
        this._info = info
        this._name = name
    }

    get name(): string {
        return this._name
    }

    set name(name: string) {
        this._name = name
    }

    get info(): IIDNInfo {
        return this._info
    }

    get connections(): ConnectionList {
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
    addConnection(connection: Connection) {
        this._connections.add(connection)
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
        let status = ConnectionStatus.Inactive
        for (const c of this._connections) {
            if (c.status == ConnectionStatus.Active) {
                status = c.status //If at least one connection is active, we show "Active"
            } else if (c.status == ConnectionStatus.Connected) {
                status = c.status
                break //If any of the connections are connected, we show "Connected"
            }
        }

        switch (status) {
            case ConnectionStatus.Inactive:
                this.iconPath = new vscode.ThemeIcon("warning")
                break
            case ConnectionStatus.Active:
                this.iconPath = new vscode.ThemeIcon("pass")
                break
            case ConnectionStatus.Connected:
                this.iconPath = new vscode.ThemeIcon("pass-filled")
                break
        }

        return status
    }
}

export class InstrumentTreeDataProvider
    implements
        vscode.TreeDataProvider<
            Instrument | Connection | ConnectionList | InactiveInstrumentList
        >
{
    private _instruments: Instrument[] = []
    private instruments_discovered: boolean = false

    addOrUpdateInstruments(instruments: Instrument[]) {
        for (const i of instruments) {
            this.addOrUpdateInstrument(i)
        }
    }
    addOrUpdateInstrument(instrument: Instrument) {
        for (const i of this._instruments) {
            if (i.info.serial_number == instrument.info.serial_number) {
                let changed = false
                for (const c of instrument.connections.set) {
                    if (!i.connections.set.has(c)) {
                        i.connections.set.add(c)
                        changed = true
                    }
                    if (i.name != instrument.name) {
                        i.name = instrument.name
                        changed = true
                    }
                }
                if (changed) {
                    this.reloadTreeData()
                }
            }
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        | void
        | Instrument
        | Connection
        | ConnectionList
        | InactiveInstrumentList
        | (Instrument | Connection | ConnectionList | InactiveInstrumentList)[]
        | null
        | undefined
    > = new vscode.EventEmitter<
        | void
        | Instrument
        | Connection
        | ConnectionList
        | InactiveInstrumentList
        | (Instrument | Connection | ConnectionList | InactiveInstrumentList)[]
        | null
        | undefined
    >()

    readonly onDidChangeTreeData: vscode.Event<
        | void
        | Instrument
        | Connection
        | ConnectionList
        | InactiveInstrumentList
        | (Instrument | Connection | ConnectionList | InactiveInstrumentList)[]
        | null
        | undefined
    > = this._onDidChangeTreeData.event

    getTreeItem(
        element:
            | Instrument
            | Connection
            | ConnectionList
            | InactiveInstrumentList,
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(
        element?:
            | Instrument
            | Connection
            | ConnectionList
            | InactiveInstrumentList
            | undefined,
    ): vscode.ProviderResult<
        (Instrument | Connection | ConnectionList | InactiveInstrumentList)[]
    > {
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
                resolve([element.connections])
            })
        }
        if (element instanceof ConnectionList) {
            return new Promise((resolve) => {
                resolve(element.as_array())
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
        throw new Error("Method not implemented.")
    }

    async refresh(): Promise<void> {
        if (this._instruments.length != 0) {
            await this.getContent()
            if (this.instruments_discovered) {
                this.reloadTreeData()
                this.instruments_discovered = false
            }
        }
    }

    async saveInstrument(instr: Instrument): Promise<void> {
        //TODO Add to saved list
        await this.saveInstrumentToList(instr)
        this.reloadTreeData()
    }

    async removeInstrument(instr: Instrument): Promise<void> {
        await this.removeSavedList(instr)
        this.reloadTreeData()
    }

    reloadTreeData() {
        this._onDidChangeTreeData.fire(undefined)
    }

    private getContent(): Promise<string> {
        return new Promise(() => {
            rpcClient.requestAdvanced(jsonRPCRequest).then(
                (jsonRPCResponse: JSONRPCResponse) => {
                    if (jsonRPCResponse.error) {
                        console.log(
                            `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`,
                        )
                    } else {
                        this.addOrUpdateInstruments(
                            InstrumentTreeDataProvider.parseDiscoveredInstruments(
                                jsonRPCResponse,
                            ).map((v) => Instrument.fromInstrInfo(v)),
                        )
                    }
                },
                () => {
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

            if (matching_instruments_indices.length == 0) {
                for (const idx of matching_instruments_indices.reverse()) {
                    instrList.splice(idx, 1)
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
        Instrument | Connection | ConnectionList | InactiveInstrumentList
    >
    private treeDataProvider?: InstrumentTreeDataProvider
    private intervalID?: NodeJS.Timeout
    private _kicProcessMgr: KicProcessMgr

    constructor(
        context: vscode.ExtensionContext,
        kicProcessMgr: KicProcessMgr,
    ) {
        this._kicProcessMgr = kicProcessMgr
        //const tdpModel = new NewTDPModel()
        //const treeDataProvider = new InstrTDP(tdpModel)
        const treeDataProvider = new InstrumentTreeDataProvider()

        this.InstrumentsDiscoveryViewer = vscode.window.createTreeView<
            Instrument | Connection | ConnectionList | InactiveInstrumentList
        >("InstrumentsExplorer", {
            treeDataProvider,
        })

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.startDiscovery()
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

        this.startDiscovery()
    }

    private startDiscovery(): void {
        if (this.InstrumentsDiscoveryViewer.message == "") {
            const discover = cp.spawn(
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

            discover.on("exit", () => {
                this.InstrumentsDiscoveryViewer.message = ""
                clearInterval(this.intervalID)
            })

            //subprocess.unref()

            this.InstrumentsDiscoveryViewer.message =
                "Instruments Discovery in progress..."

            //this.treeDataProvider?.clear()

            this.intervalID = setInterval(() => {
                this.treeDataProvider?.refresh().then(
                    () => {},
                    () => {},
                )
            }, 1000)
        }
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
            item != undefined
        ) {
            item.name = name
            this.treeDataProvider?.addOrUpdateInstrument(item)
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
            cp.spawn(EXECUTABLE, [
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
