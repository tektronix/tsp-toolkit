import * as vscode from "vscode"
import {
    JSONRPC,
    JSONRPCClient,
    JSONRPCRequest,
    JSONRPCResponse,
} from "json-rpc-2.0"
import { plainToInstance } from "class-transformer"
import {
    Connection,
    ConnectionStatus,
    connectionStatusIcon,
} from "./connection"
import {
    InactiveInstrumentList,
    InfoList,
    instr_map,
    Instrument,
    StringData,
} from "./instrument"
import { Log, SourceLocation } from "./logging"
import {
    ConnectionDetails,
    idn_to_string,
    InstrInfo,
    IoType,
} from "./resourceManager"

let nextID = 0
const createID = () => nextID++

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

type TreeData = Instrument | Connection | InactiveInstrumentList | StringData
type VscTdp = vscode.TreeDataProvider<TreeData>

export class InstrumentProvider implements VscTdp, vscode.Disposable {
    private _instruments: Instrument[] = []
    private instruments_discovered: boolean = false
    private _savedInstrumentConfigWatcher: vscode.Disposable | undefined =
        undefined

    private static _instance: InstrumentProvider | undefined = undefined

    static get instance(): InstrumentProvider {
        if (!InstrumentProvider._instance) {
            InstrumentProvider._instance = new InstrumentProvider()
        }
        return InstrumentProvider._instance
    }

    constructor() {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.constructor()",
        }
        Log.debug("Instantiating InstrumentTreeDataProvider", LOGLOC)
        this.getSavedInstruments().catch(() => {})
        this.configWatcherEnable(true)
    }

    dispose() {
        for (const i of this._instruments) {
            i.dispose()
        }
    }

    get instruments(): Instrument[] {
        return this._instruments
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
        if (!instrument.saved) {
            // If the instrument isn't listed as saved, we don't need to update the saved list
            return
        }

        Log.debug(
            `Updating saved instrument with sn ${instrument.info.serial_number}`,
            LOGLOC,
        )
        // Get all the saved entries
        const raw: InstrInfo[] =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        // Of all the connections in the given instrument, find the ones that aren't in
        // the other list
        const missing = instrument.connections.filter((v) => {
            for (const m of raw) {
                if (
                    m.serial_number === instrument.info.serial_number &&
                    m.instr_address === v.addr
                ) {
                    return false
                }
            }
            return true
        })

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

        await vscode.workspace
            .getConfiguration("tsp")
            .update("savedInstruments", raw, vscode.ConfigurationTarget.Global)
    }

    addOrUpdateInstruments(instruments: Instrument[]) {
        for (const i of instruments) {
            this.addOrUpdateInstrument(i)
        }
    }

    getQuickPickOptions(): vscode.QuickPickItem[] {
        const connections: {
            name: string
            addr: string
            status: ConnectionStatus
            idn: string
        }[] = []

        for (const i of this._instruments) {
            for (const c of i.connections) {
                connections.push({
                    name: i.name,
                    addr: c.addr,
                    status: c.status ?? ConnectionStatus.Inactive,
                    idn: idn_to_string(i.info),
                })
            }
        }

        return connections
            .filter(
                (c) =>
                    c.status === ConnectionStatus.Active ||
                    c.status === ConnectionStatus.Connected ||
                    c.status === ConnectionStatus.Inactive,
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .sort((a, b) => -(a.status - b.status))
            .map((x) => {
                return {
                    label: `${x.name}@${x.addr}`,
                    description: x.idn,
                    iconPath: connectionStatusIcon(x.status),
                }
            })
    }

    async getTerminalByPid(term_pid: number): Promise<Connection | undefined> {
        for (const i of this.instruments) {
            for (const c of i.connections) {
                if (c.terminal && (await c.terminal.processId) === term_pid) {
                    return c
                }
            }
        }

        return undefined
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
                    this._instruments[found_idx].name !== instrument.name &&
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
            instrument.onChanged(() => {
                this.reloadTreeData()
            })
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
                            x.status === ConnectionStatus.Active ||
                            x.status === ConnectionStatus.Connected,
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
                            x.status === ConnectionStatus.Inactive ||
                            x.status === ConnectionStatus.Ignored,
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
                    if (e.affectsConfiguration("tsp.savedInstruments")) {
                        this.getSavedInstruments().catch(() => {})
                    }
                })
        } else if (!enabled && this._savedInstrumentConfigWatcher) {
            this._savedInstrumentConfigWatcher.dispose()
            this._savedInstrumentConfigWatcher = undefined
        }
    }

    getConnection(details: ConnectionDetails): Connection | null {
        const matching_instruments = this._instruments.filter(
            (i) => i.name === details.name,
        )

        for (const i of matching_instruments) {
            for (const c of i.connections) {
                if (
                    c.addr === details.addr &&
                    (c.type as string).toLowerCase() ===
                        details.type.toLowerCase()
                ) {
                    return c
                }
            }
        }

        return null
    }

    async refresh(discovery_cb: () => Promise<void>): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.refresh()",
        }

        Log.info("Refreshing Discovered list", LOGLOC)
        await this.updateStatus()
        await discovery_cb()

        this.doWithConfigWatcherOff(() => {
            this.updateSavedAll(this._instruments).catch(() => {})
        })

        this.instruments_discovered = false
    }

    async saveInstrument(instr: Instrument): Promise<void> {
        instr.saved = true
        await this.updateSaved(instr)
        this.reloadTreeData()
    }

    async removeInstrument(instr: Instrument): Promise<void> {
        Log.info(`Remove ${instr.info.serial_number}`, {
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
                    const i =
                        this._instruments.find(
                            (i) => i.info.serial_number === v.serial_number,
                        ) ?? Instrument.from(v)
                    i.saved = true
                    return i
                }),
            )

            //raw:  {1, 2, 3, 4}
            //inst: {   2,    4, 5, 6}
            const to_remove = this._instruments.filter((v) => {
                for (const r of raw) {
                    if (r.serial_number === v.info.serial_number) {
                        return false
                    }
                }
                return true
            })

            //raw:          {1, 2, 3, 4      }
            //inst:         {   2,    4, 5, 6}
            //to_remove:    {            5, 6}

            for (const r of to_remove) {
                this._instruments = this._instruments.filter(
                    (i) =>
                        i.info.serial_number !== r.info.serial_number ||
                        !i.saved,
                )
                this.reloadTreeData()
            }
            //inst:         {   2,    4, 5, 6}
            //to_remove:    {            5, 6}
            //inst:         {   2,    4      }

            return this._instruments
        })
    }

    private async updateStatus(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.updateStatus()",
        }
        const parallel_info: Promise<void>[] = []
        for (let i = 0; i < this._instruments.length; i++) {
            Log.debug(
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
                        Log.error(
                            `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`,
                            {
                                file: "instruments.ts",
                                func: "InstrumentProvider.getContent()",
                            },
                        )
                    } else {
                        // Parse discovered instruments
                        const discoveredInstrInfos = InstrumentProvider.parseDiscoveredInstruments(
                            jsonRPCResponse,
                        )

                        // Compare with existing instruments to detect IP address changes
                        for (const discovered of discoveredInstrInfos) {
                            const existing = this._instruments.find(
                                (i) => i.info.serial_number === discovered.serial_number
                            )
                            
                            if (existing) {
                                const existingAddr = existing.connections[0]?.addr
                                const discoveredAddr = discovered.instr_address
                                
                                if (existingAddr && existingAddr !== discoveredAddr) {
                                    // Update the saved instruments configuration if this instrument was saved
                                    if (existing.saved) {
                                        this.updateSaved(existing).catch((err) => {
                                            Log.error(`Failed to update saved instrument: ${err}`, {
                                                file: "instruments.ts",
                                                func: "InstrumentProvider.getContent()",
                                            })
                                        })
                                    }
                                }
                            }
                        }

                        this.addOrUpdateInstruments(
                            discoveredInstrInfos.map((v: InstrInfo) => {
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

                    resolve(this.instruments_discovered)
                },
                () => {
                    Log.error("RPC Instr List Fetch failed!", {
                        file: "instruments.ts",
                        func: "InstrumentProvider.getContent()",
                    })
                    reject(new Error("RPC Instr List Fetch failed!"))
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
        jsonRPCResponse: JSONRPCResponse): InstrInfo[] {
        const discovery_list: InstrInfo[] = []
        const res: unknown = jsonRPCResponse.result
        if (typeof res === "string") {
            const instrList = res.split("\n")

            //need to remove the last newline element??
            instrList?.forEach((instr) => {
                let new_instr: InstrInfo | undefined = undefined
                if (instr.length > 0) {
                    const obj = plainToInstance(InstrInfo, JSON.parse(instr))

                    if (discovery_list.length === 0) {
                        discovery_list.push(obj)
                    } else {
                        let idx = -1
                        new_instr = undefined

                        for (let i = 0; i < discovery_list.length; i++) {
                            new_instr = undefined
                            if (
                                DiscoveryHelper.createUniqueID(
                                    discovery_list[i],
                                ) === DiscoveryHelper.createUniqueID(obj)
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

                        if (new_instr !== undefined) {
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
            const raw: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")

            const matching_instruments_indices =
                InstrumentProvider.getAllIndices(raw, (v) => {
                    return (
                        v.model === instr.info.model &&
                        v.serial_number === instr.info.serial_number
                    )
                })
            Log.trace(
                `Removing ${matching_instruments_indices.length} instances of ${instr.info.serial_number}`,
                LOGLOC,
            )

            for (const idx of matching_instruments_indices.reverse()) {
                Log.trace(`Removing ${JSON.stringify(raw[idx])}`, LOGLOC)
                raw.splice(idx, 1)
            }

            await config.update(
                "savedInstruments",
                raw,
                vscode.ConfigurationTarget.Global,
            )

            this._instruments = this._instruments.filter(
                (i) => i.info.serial_number !== instr.info.serial_number,
            )
        } catch (err_msg) {
            vscode.window.showErrorMessage(String(err_msg))
        }
    }
    async sendToAllActiveTerminals(filepath: string) {
        const promises: Promise<void>[] = []
        for (const i of this._instruments) {
            promises.push(i.sendScript(filepath))
        }

        await Promise.allSettled(promises)
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
                    InstrumentProvider.getAllIndices(instrList, (v) => {
                        return (
                            v.model === instr.info.model &&
                            v.serial_number === instr.info.serial_number &&
                            v.io_type === i.type &&
                            (i.type === IoType.Visa
                                ? v.instr_address.substring(0, 4) ==
                                  i.addr.substring(0, 4)
                                : true)
                        )
                    })
                if (matching_instruments_indices.length === 0) {
                    instrList.push({
                        io_type: i.type,
                        instr_address: i.addr,
                        manufacturer: instr.info.vendor,
                        model: instr.info.model,
                        serial_number: instr.info.serial_number,
                        firmware_revision: instr.info.firmware_rev,
                        instr_categ: instr_map.get(instr.info.model) ?? "",
                        friendly_name: instr.name,
                        socket_port: i.type === IoType.Lan ? "5025" : undefined,
                    })
                } else {
                    for (const m of matching_instruments_indices) {
                        if (
                            instrList[m].io_type === IoType.Visa &&
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
