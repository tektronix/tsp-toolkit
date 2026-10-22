import { ChildProcessWithoutNullStreams } from "node:child_process"
import * as readline from "node:readline"
import * as vscode from "vscode"
import { JSONRPCClient, JSONRPCResponse } from "json-rpc-2.0"
import { plainToInstance } from "class-transformer"
import {
    Connection,
    ConnectionStatus,
    connectionStatusIcon,
} from "./connection"
import {
    HiddenInstruments,
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
import { DISCOVERY_TIMEOUT } from "./instrumentExplorer"
import {
    BULK_MP5103_CONTEXT_KEY,
    hasMultipleAvailableMP5103,
} from "./bulkFirmwareUpdate"

let nextID = 0
const createID = () => nextID++

export const CULL_THRESHOLD_MS: number = DISCOVERY_TIMEOUT * 3 * 1000

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

type TreeData =
    | Instrument
    | Connection
    | InactiveInstrumentList
    | HiddenInstruments
    | StringData
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
        this.getSavedInstruments().catch((error: unknown) => {
            Log.error(
                `Failed to load instrument lists: ${String(error)}`,
                LOGLOC,
            )
            void vscode.window.showErrorMessage(String(error))
        })
        this.configWatcherEnable(true)
        this.updateBulkMp5103Context()
    }

    dispose() {
        for (const i of this._instruments) {
            i.dispose()
        }
        void vscode.commands.executeCommand(
            "setContext",
            BULK_MP5103_CONTEXT_KEY,
            false,
        )
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
                    m.model === instrument.info.model &&
                    m.serial_number === instrument.info.serial_number &&
                    m.io_type === v.type &&
                    (m.instr_address === v.addr ||
                        (m.io_type === IoType.Lan && v.type === IoType.Lan))
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
            if (
                r.model === instrument.info.model &&
                r.serial_number === instrument.info.serial_number
            ) {
                if (r.friendly_name !== instrument.name) {
                    r.friendly_name = instrument.name
                }
                if (r.firmware_revision !== instrument.info.firmware_rev) {
                    if (instrument.info.firmware_rev == "UNKNOWN") {
                        //avoid writing UNKNOWN for firmware revision, instead keep the last known revision in the saved list
                        Log.warn(
                            `Firmware revision for ${instrument.name} is UNKNOWN, keeping the last known revision ${r.firmware_revision}`,
                            {
                                file: "instruments.ts",
                                func: "InstrumentTreeDataProvider.updateSaved()",
                            },
                        )
                    } else {
                        r.firmware_revision = instrument.info.firmware_rev
                    }
                }
                // Update the address if it changed for this connection
                const matchingConnection = instrument.connections.find(
                    (c) => c.type === r.io_type,
                )
                if (
                    matchingConnection &&
                    r.instr_address !== matchingConnection.addr
                ) {
                    r.instr_address = matchingConnection.addr
                }
            }
        }

        const unique = raw.filter(
            (entry, index, entries) =>
                entries.findIndex(
                    (candidate) =>
                        candidate.serial_number === entry.serial_number &&
                        candidate.model === entry.model &&
                        candidate.io_type === entry.io_type &&
                        candidate.instr_address === entry.instr_address,
                ) === index,
        )

        await vscode.workspace
            .getConfiguration("tsp")
            .update(
                "savedInstruments",
                unique,
                vscode.ConfigurationTarget.Global,
            )
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
            if (i.hidden) {
                continue
            }
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

    addOrUpdateInstrument(instrument: Instrument): Instrument {
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
        let tracked = instrument
        if (found_idx > -1) {
            tracked = this._instruments[found_idx]
            this._instruments[found_idx].updateInfo(instrument.info)
            if (this._instruments[found_idx] !== instrument) {
                for (const c of instrument.connections) {
                    changed =
                        this._instruments[found_idx].addConnection(c) || changed
                    if (
                        this._instruments[found_idx].name !== instrument.name &&
                        !this._instruments[found_idx].saved &&
                        instrument.name
                    ) {
                        this._instruments[found_idx].name = instrument.name
                        changed = true
                    }
                }
            }
            if (changed) {
                this._instruments[found_idx].updateStatus()
            }
        } else {
            if (!instrument.name) {
                instrument.name = `${instrument.info.model}#${instrument.info.serial_number}`
                instrument.label = instrument.name
            }
            instrument.onChanged(() => {
                this.reloadTreeData()
            })
            this._instruments.push(instrument)
            changed = true
        }

        this.reloadTreeData()
        return tracked
    }

    private _onDidChangeTreeData = new vscode.EventEmitter<
        void | TreeData | TreeData[] | null | undefined
    >()

    readonly onDidChangeTreeData: vscode.Event<
        void | TreeData | TreeData[] | null | undefined
    > = this._onDidChangeTreeData.event

    getTreeItem(
        element: TreeData,
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    getChildren(element?: TreeData): vscode.ProviderResult<TreeData[]> {
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
                            x.status === ConnectionStatus.Connecting ||
                            x.status === ConnectionStatus.Connected,
                    ),
                    new InactiveInstrumentList(),
                    new HiddenInstruments(),
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
                        (x) => x.status === ConnectionStatus.Inactive,
                    ),
                ])
            })
        }
        if (element instanceof HiddenInstruments) {
            return Promise.resolve(this._instruments.filter((i) => i.hidden))
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
                    if (
                        e.affectsConfiguration("tsp.savedInstruments") ||
                        e.affectsConfiguration("tsp.hiddenInstruments")
                    ) {
                        this.getSavedInstruments().catch((error: unknown) => {
                            Log.error(
                                `Failed to load instrument lists: ${String(error)}`,
                                {
                                    file: "instrumentProvider.ts",
                                    func: "InstrumentProvider.configWatcherEnable()",
                                },
                            )
                            void vscode.window.showErrorMessage(String(error))
                        })
                    }
                })
        } else if (!enabled && this._savedInstrumentConfigWatcher) {
            this._savedInstrumentConfigWatcher.dispose()
            this._savedInstrumentConfigWatcher = undefined
        }
    }

    getConnection(details: ConnectionDetails): Connection | null {
        const matches = (c: Connection) =>
            c.addr === details.addr &&
            (c.type as string).toLowerCase() === details.type.toLowerCase()

        for (const i of this._instruments.filter(
            (i) => i.name === details.name,
        )) {
            const c = i.connections.find(matches)
            if (c) {
                return c
            }
        }

        // Typed connection strings usually have no name; reuse the tree's own
        // connection so it owns the terminal and keeps its Connected status.
        for (const i of this._instruments) {
            const c = i.connections.find(matches)
            if (c) {
                return c
            }
        }

        return null
    }

    async refresh(discovery_cb: () => Promise<void>): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.refresh()",
        }

        await vscode.window.withProgress(
            {
                cancellable: false,
                location: { viewId: "InstrumentsExplorer" },
            },
            async () => {
                Log.info("Refreshing Discovered list", LOGLOC)
                await this.updateStatus()
                await discovery_cb()
                await new Promise<void>((resolve) => {
                    this.doWithConfigWatcherOff(() => {
                        this.updateSavedAll(this._instruments).then(
                            () => {
                                resolve()
                            },
                            () => {},
                        )
                    })
                })

                this.instruments_discovered = false
            },
        )
    }

    async showHiddenConnection(connection: Connection): Promise<void> {
        if (connection.parent?.hidden) {
            await this.saveInstrument(connection.parent)
        }
    }

    async saveInstrument(instr: Instrument): Promise<void> {
        const wasSaved = instr.saved
        this.configWatcherEnable(false)
        try {
            const config = vscode.workspace.getConfiguration("tsp")
            const saved = config.get<InstrInfo[]>("savedInstruments") ?? []
            instr.saved = true
            await this.updateSaved(instr)
            const hidden = config.get<InstrInfo[]>("hiddenInstruments") ?? []
            try {
                await config.update(
                    "hiddenInstruments",
                    hidden.filter(
                        (i) =>
                            i.model !== instr.info.model ||
                            i.serial_number !== instr.info.serial_number,
                    ),
                    vscode.ConfigurationTarget.Global,
                )
            } catch (error) {
                try {
                    await config.update(
                        "savedInstruments",
                        saved,
                        vscode.ConfigurationTarget.Global,
                    )
                } catch (rollbackError) {
                    throw new AggregateError(
                        [error, rollbackError],
                        "Failed to save instrument and restore the saved instrument list.",
                    )
                }
                throw error
            }
            instr.hidden = false
            this.reloadTreeData()
        } catch (error) {
            instr.saved = wasSaved
            Log.error(`Failed to save instrument: ${String(error)}`, {
                file: "instrumentProvider.ts",
                func: "InstrumentProvider.saveInstrument()",
            })
            void vscode.window.showErrorMessage(String(error))
            throw error
        } finally {
            this.configWatcherEnable(true)
        }
    }

    async hideInstrument(instr: Instrument): Promise<void> {
        Log.info(`Hide ${instr.info.serial_number}`, {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.hideInstrument()",
        })
        await this.hideSavedInstrument(instr)
        this.reloadTreeData()
    }

    reloadTreeData() {
        // Sort the connections by name
        // Sorting removed because it caused saved instruments to jump around in the list
        // this._instruments.sort((a, b) => a.name.localeCompare(b.name))
        // Sort the connections by status
        // (we want to show higher values first, so invert the result)
        // this._instruments.sort((a, b) => -(a.status - b.status))
        this.updateBulkMp5103Context()
        this._onDidChangeTreeData.fire(undefined)
    }

    private updateBulkMp5103Context() {
        void vscode.commands.executeCommand(
            "setContext",
            BULK_MP5103_CONTEXT_KEY,
            hasMultipleAvailableMP5103(this._instruments),
        )
    }

    private getSavedInstruments(): Promise<Instrument[]> {
        return new Promise((resolve) => {
            const hidden: InstrInfo[] =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("hiddenInstruments") ?? []
            for (const instrument of this._instruments) {
                instrument.hidden = hidden.some(
                    (i) =>
                        i.model === instrument.info.model &&
                        i.serial_number === instrument.info.serial_number,
                )
                if (instrument.hidden) {
                    instrument.saved = false
                }
            }
            for (const entry of hidden) {
                const instrument = Instrument.from(entry)
                instrument.hidden = true
                this.addOrUpdateInstrument(instrument)
            }
            const raw: InstrInfo[] =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []

            this.addOrUpdateInstruments(
                raw
                    .filter(
                        (v) =>
                            !hidden.some(
                                (i) =>
                                    i.model === v.model &&
                                    i.serial_number === v.serial_number,
                            ),
                    )
                    .map((v) => {
                        const i =
                            this._instruments.find(
                                (i) =>
                                    i.info.model === v.model &&
                                    i.info.serial_number === v.serial_number,
                            ) ?? Instrument.from(v)
                        i.connections.forEach((c) => {
                            c.lastFound = new Date(0)
                        })
                        i.saved = true
                        return i
                    }),
            )

            //raw:  {1, 2, 3, 4}
            //inst: {   2,    4, 5, 6}
            const to_remove = this._instruments.filter((v) => {
                for (const r of raw) {
                    if (
                        r.model === v.info.model &&
                        r.serial_number === v.info.serial_number
                    ) {
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
                        i.info.model !== r.info.model ||
                        i.info.serial_number !== r.info.serial_number ||
                        !i.saved,
                )
                this.reloadTreeData()
            }
            //inst:         {   2,    4, 5, 6}
            //to_remove:    {            5, 6}
            //inst:         {   2,    4      }

            resolve(this._instruments)
        })
    }

    private async updateStatus(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.updateStatus()",
        }
        const parallel_info: Promise<void>[] = []
        for (let i = 0; i < this._instruments.length; i++) {
            if (this._instruments[i].hidden) {
                continue
            }
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
    async getContent(
        discovery_proc: ChildProcessWithoutNullStreams,
    ): Promise<boolean> {
        const LOGLOC: SourceLocation = {
            file: "instrumentProvider.ts",
            func: "InstrumentProvider.getContent()",
        }
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: discovery_proc.stdout,
            })
            rl.on("line", (line) => {
                const discovered = JSON.parse(line) as InstrInfo
                this.instruments_discovered = true
                const inst = Instrument.from(discovered)
                inst.connections.forEach((c) => {
                    c.lastFound = new Date()
                    c.status = ConnectionStatus.Active
                })
                inst.updateStatus()
                if (inst.info.serial_number && inst.info.model) {
                    this.addOrUpdateInstrument(inst)
                    const updated = this._instruments.find(
                        (i) =>
                            i.info.model === inst.info.model &&
                            i.info.serial_number === inst.info.serial_number,
                    )
                    if (updated?.saved) {
                        this.updateSaved(updated).catch((err) => {
                            Log.error(
                                `Failed to update saved instrument: ${err}`,
                                {
                                    file: "instruments.ts",
                                    func: "InstrumentProvider.getContent()",
                                },
                            )
                        })
                    }
                    this.reloadTreeData()
                }
            })

            discovery_proc.on("exit", (code: number) => {
                if (code) {
                    Log.trace(`Discover Exit Code: ${code}`, LOGLOC)
                }
                for (const i of this._instruments) {
                    for (const c of i.connections) {
                        if (
                            Date.now() - c.lastFound.getTime() <
                                CULL_THRESHOLD_MS &&
                            !(
                                c.status === ConnectionStatus.Connected ||
                                c.status === ConnectionStatus.Connecting
                            )
                        ) {
                            c.status = ConnectionStatus.Inactive
                        }
                    }
                }
                resolve(this.instruments_discovered)
            })
        })
    }

    /**
     * Used to parse the discovered instrument details and create a list for the same
     *
     * @param discovered_raw - json rpc response whose result needs to be parsed
     * to extract the discovered instrument details
     */
    static parseDiscoveredInstruments(discovered_raw: string): InstrInfo[] {
        const discovery_list: InstrInfo[] = []
        if (typeof discovered_raw === "string") {
            const instrList = discovered_raw.split("\n")

            //need to remove the last newline element??
            for (const instr of instrList) {
                if (instr.length > 0) {
                    const obj = plainToInstance(InstrInfo, JSON.parse(instr))

                    if (
                        !discovery_list.find((x) => {
                            return (
                                x.serial_number === obj.serial_number &&
                                x.model === obj.model &&
                                x.instr_address === obj.instr_address
                            )
                        })
                    ) {
                        discovery_list.push(obj)
                    }
                }
            }
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
    private async hideSavedInstrument(instr: Instrument) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "InstrumentTreeDataProvider.hideInstrument()",
        }
        this.configWatcherEnable(false)
        try {
            const raw: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")
            const hidden = config.get<InstrInfo[]>("hiddenInstruments") ?? []
            const hiddenEntries = hidden.filter(
                (i) =>
                    i.model !== instr.info.model ||
                    i.serial_number !== instr.info.serial_number,
            )
            hiddenEntries.push(
                ...instr.connections.map(
                    (c): InstrInfo => ({
                        io_type: c.type,
                        instr_address: c.addr,
                        manufacturer: instr.info.vendor,
                        model: instr.info.model,
                        serial_number: instr.info.serial_number,
                        firmware_revision: instr.info.firmware_rev,
                        instr_categ: instr.category,
                        friendly_name: instr.name,
                    }),
                ),
            )

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
                "hiddenInstruments",
                hiddenEntries,
                vscode.ConfigurationTarget.Global,
            )
            try {
                await config.update(
                    "savedInstruments",
                    raw,
                    vscode.ConfigurationTarget.Global,
                )
            } catch (error) {
                try {
                    await config.update(
                        "hiddenInstruments",
                        hidden,
                        vscode.ConfigurationTarget.Global,
                    )
                } catch (rollbackError) {
                    throw new AggregateError(
                        [error, rollbackError],
                        "Failed to hide instrument and restore the hidden instrument list.",
                    )
                }
                throw error
            }

            instr.saved = false
            instr.hidden = true
        } catch (err_msg) {
            Log.error(`Failed to hide instrument: ${String(err_msg)}`, LOGLOC)
            void vscode.window.showErrorMessage(String(err_msg))
            throw err_msg
        } finally {
            this.configWatcherEnable(true)
        }
    }
    // async sendToAllActiveTerminals(filepath: string) {
    //     const promises: Promise<void>[] = []
    //     for (const i of this._instruments) {
    //         promises.push(i.sendScript(filepath))
    //     }

    //     await Promise.allSettled(promises)
    // }

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
