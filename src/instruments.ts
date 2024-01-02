import * as cp from "node:child_process"

import * as vscode from "vscode"
import {
    JSONRPC,
    JSONRPCClient,
    JSONRPCRequest,
    JSONRPCResponse,
} from "json-rpc-2.0"
import { DISCOVER_EXECUTABLE, EXECUTABLE } from "@tek-engineering/kic-cli"
import fetch from "node-fetch"
import {
    FriendlyNameMgr,
    InstrDetails,
    IoType,
    KicProcessMgr,
} from "./resourceManager"

const DISCOVERY_TIMEOUT = 300

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
                    .then((jsonRPCResponse: JSONRPCResponse) =>
                        rpcClient.receive(jsonRPCResponse)
                    )
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            } else if (jsonRPCRequest.id !== undefined) {
                return Promise.reject(new Error(response.statusText))
            }
        }),
    createID
)

const jsonRPCRequest: JSONRPCRequest = {
    jsonrpc: JSONRPC,
    id: createID(),
    method: "get_instr_list",
}

//interface for *idn? response
interface IIDNInfo {
    vendor: string
    model: string
    serial_number: string
    firmware_rev: string
}

/**
 * io_type - Lan, Usb etc.
 * ip_addr - used to connect via Lan
 * unique_string - used to connect via Usb
 * instr_categ - versatest, tti, 26xx etc.
 */

interface IInstrInfo {
    io_type: IoType
    ip_addr?: string
    manufacturer: string
    model: string
    serial_number: string
    firmware_revision: string
    socket_port?: string
    unique_string?: string
    instr_categ: string
}

class InstrNode {
    #labelPrivate: string
    #expandablePrivate: boolean
    children: InstrNode[] = []
    constructor(name: string, expandable?: boolean) {
        this.#labelPrivate = name
        this.#expandablePrivate = expandable ?? false
    }
    public get label(): string {
        return this.#labelPrivate
    }
    // public get_Children(): InstrNode[] {
    //     return this.#childrenPrivate
    // }

    public updateLabelVal(label: string) {
        this.#labelPrivate = label
    }

    public get isExpandable(): boolean {
        return this.#expandablePrivate
    }
}

class IONode extends InstrNode {
    constructor(label: string, supported_type: IoType, isExpandable?: boolean) {
        super(label, isExpandable)
        this.supported_type = supported_type
    }

    private instrInList: string[] = []
    private supported_type: IoType = IoType.Lan
    private saved_list: string[] = []

    public IsSupported(type: IoType): boolean {
        return this.supported_type == type
    }

    public AddInstrument(instr: IInstrInfo, is_saved: boolean) {
        if (instr.io_type != this.supported_type) return
        let found = false
        const unique_id = DiscoveryHelper.createUniqueID(instr)

        //ToDo: extract to method
        for (let i = 0; i < this.saved_list.length; i++) {
            if (this.saved_list[i] == unique_id) {
                return
            }
        }

        this.instrInList.forEach((element) => {
            if (element == unique_id) {
                found = true
            }
        })
        if (!found) {
            this.instrInList.push(unique_id)
            this.children.push(new IOInstrNode(instr, is_saved))
        }

        this.children.forEach((child) => {
            const res = child as IOInstrNode
            if (res != undefined) {
                res.checkForFriendlyName()
            }
        })
    }

    public ClearAll() {
        this.instrInList.splice(0)
        this.children.splice(0)
    }

    public ClearSavedDuplicateInstr(saved_list: string[]) {
        const idx_arr: number[] = []
        saved_list.forEach((saved_instr) => {
            const idx = this.instrInList.indexOf(saved_instr)
            if (idx > -1) {
                this.instrInList.splice(idx, 1)
            }

            for (let i = 0; i < this.children.length; i++) {
                const res = this.children[i] as IOInstrNode
                if (res.FetchUniqueID() == saved_instr) {
                    idx_arr.push(i)
                }
            }

            idx_arr.forEach((idx) => {
                this.children.splice(idx, 1)
            })
        })
    }

    public innerRemInstrFromSavedNode(instrID: string) {
        const idx1 = this.instrInList.indexOf(instrID)
        if (idx1 > -1) {
            this.instrInList.splice(idx1, 1)
        }
        let idx2 = -1
        for (let i = 0; i < this.children.length; i++) {
            const res = this.children[i] as IOInstrNode
            if (res.FetchUniqueID() == instrID) {
                idx2 = i
                break
            }
        }

        if (idx2 > -1) {
            this.children.splice(idx2, 1)
        }
    }

    public updateSavedList(saved_list: string[]) {
        this.saved_list = saved_list
    }
}
class LanNode extends IONode {
    constructor() {
        super("LAN", IoType.Lan, true)
    }
}
class USBNode extends IONode {
    constructor() {
        super("USB", IoType.Usb, true)
    }
}
class SavedNode extends InstrNode {
    constructor() {
        super("Saved", true)
    }
}

class IOInstrNode extends InstrNode {
    private _instrInfo: IInstrInfo
    private _isSaved = false
    public showNestedMenu = true
    private _modSerial = ""

    constructor(instr: IInstrInfo, is_saved: boolean) {
        super(instr.model + "#" + instr.serial_number)
        this._modSerial = instr.model + "#" + instr.serial_number

        this._instrInfo = instr
        this._isSaved = is_saved

        this.addChildNodes()
    }

    public FetchInstrCateg(): string | undefined {
        return this._instrInfo.instr_categ
    }

    public FetchSaveStatus(): boolean {
        return this._isSaved
    }

    public FetchUniqueID(): string | undefined {
        return this._instrInfo.io_type.toString() + ":" + this._modSerial
    }

    public FetchConnectionAddr(): string {
        if (this._instrInfo.io_type == IoType.Lan) {
            return this._instrInfo.ip_addr ?? ""
        }
        return this._instrInfo.unique_string ?? ""
    }

    public FetchInstrIOType(): IoType {
        return this._instrInfo.io_type
    }

    public checkForFriendlyName() {
        const connections: Array<InstrDetails> =
            vscode.workspace.getConfiguration("kic").get("connectionList") ?? []

        let friendly_name = ""
        const res_instr = connections.find(
            (x: InstrDetails) =>
                x.io_type == this._instrInfo.io_type &&
                x.model_serial == this._modSerial
        )
        if (res_instr != undefined) {
            friendly_name = res_instr.friendly_name
        } else {
            //add the instrument to connection list so that user can't enter duplicate names
            const new_name =
                this._instrInfo.io_type.toString() + ":" + this._modSerial
            const new_addr =
                (this._instrInfo.io_type === IoType.Lan
                    ? this._instrInfo.ip_addr
                    : this._instrInfo.unique_string) ?? "NA"
            FriendlyNameMgr.handleFriendlyName(
                this._instrInfo.io_type,
                this._modSerial,
                new_name,
                new_addr
            )
            friendly_name = new_name
        }

        super.updateLabelVal(friendly_name)
    }

    public fetchModelSerial(): string {
        return this._modSerial
    }

    private addChildNodes() {
        //for loop with child nodes - remaining
        if (this._instrInfo.io_type == IoType.Lan) {
            this.children.push(new InstrNode(this._instrInfo.ip_addr ?? "NA"))
        } else {
            this.children.push(
                new InstrNode(this._instrInfo.unique_string ?? "NA")
            )
        }

        this.children.push(new InstrNode("Model: " + this._instrInfo.model))
        this.children.push(
            new InstrNode("Port: " + (this._instrInfo.socket_port ?? "NA"))
        )
        this.children.push(
            new InstrNode("Serial No: " + this._instrInfo.serial_number)
        )
    }
}

interface IRootNodeProvider {
    GetInstrumentNode(
        info: IInstrInfo,
        is_saved: boolean
    ): InstrNode | undefined
}

class NodeProvider implements IRootNodeProvider {
    private _isSaved = false
    constructor(ioNode: IONode) {
        this.ioNode = ioNode
    }
    private ioNode: IONode | undefined
    GetInstrumentNode(
        instr: IInstrInfo,
        is_saved: boolean
    ): IONode | undefined {
        if (!this.ioNode?.IsSupported(instr.io_type)) return undefined

        this._isSaved = is_saved

        this.updateIONode(instr)
        if (this.ioNode?.children.length == 0) return undefined
        return this.ioNode
    }

    private updateIONode(instr: IInstrInfo) {
        this.ioNode?.AddInstrument(instr, this._isSaved)
    }

    // public clearIfSaved(saved_list: string[]) {
    //     this.ioNode?.ClearSavedDuplicateInstr(saved_list)
    // }

    public updateSavedList(saved_list: string[], do_clear: boolean) {
        if (do_clear) {
            this.ioNode?.ClearSavedDuplicateInstr(saved_list)
        }
        this.ioNode?.updateSavedList(saved_list)
    }

    public removeInstrFromSavedNode(instrID: string) {
        this.ioNode?.innerRemInstrFromSavedNode(instrID)
    }
}

class LanNodeProvider extends NodeProvider {
    constructor() {
        super(new LanNode())
    }
}
class USBNodeProvider extends NodeProvider {
    constructor() {
        super(new USBNode())
    }
}

class SavedNodeProvider implements IRootNodeProvider {
    private node_providers: IRootNodeProvider[] = []
    private savedNode: SavedNode | undefined
    private saved_list: string[] = []

    private _lanNodeProvider: LanNodeProvider | undefined
    private _usbNodeProvider: USBNodeProvider | undefined

    constructor() {
        const instruments: string[] =
            vscode.workspace
                .getConfiguration("kic")
                .get("savedInstrumentList") ?? []
        //instruments.push("0123789A")
        //instruments.push("7801264")

        //saved_list - unique combination of iotype + ":" + model + "#" + serial_num
        this.saved_list = instruments

        this._lanNodeProvider = new LanNodeProvider()
        this._usbNodeProvider = new USBNodeProvider()
        this.node_providers.push(this._lanNodeProvider)
        this.node_providers.push(this._usbNodeProvider)
    }

    GetInstrumentNode(instr: IInstrInfo): InstrNode | undefined {
        if (this.savedNode == undefined) {
            this.savedNode = new SavedNode()
        }

        let isSaved = false
        this.saved_list.forEach((value) => {
            if (value.includes(DiscoveryHelper.createUniqueID(instr))) {
                isSaved = true
            }
        })
        if (isSaved) {
            const nodeItems = this.savedNode.children
            for (const node_provider of this.node_providers) {
                const ret = node_provider.GetInstrumentNode(instr, isSaved)
                if (!nodeItems.includes(ret as InstrNode)) {
                    if (ret != undefined) {
                        nodeItems.push(ret)
                        break
                    }
                }
            }
            if (nodeItems.length > 0) {
                //to prevent empty usb, lan nodes addition
                const tempItems: InstrNode[] = []
                nodeItems.forEach((item) => {
                    if (item.children.length > 0) {
                        tempItems.push(item)
                    }
                })
                this.savedNode.children = tempItems
            }
            if (this.savedNode.children.length > 0) {
                return this.savedNode
            }
        }
        return undefined
    }

    public saveInstrToList(unique_id: string) {
        if (!this.saved_list.includes(unique_id)) {
            this.saved_list.push(unique_id)
        }
    }

    public getSavedInstrList(): string[] {
        return this.saved_list
    }

    public removeInstrFromList(unique_id: string) {
        const idx = this.saved_list.indexOf(unique_id)
        if (idx > -1) {
            this.saved_list.splice(idx, 1)
        }

        if (unique_id.includes("Lan")) {
            this._lanNodeProvider?.removeInstrFromSavedNode(unique_id)
        } else {
            this._usbNodeProvider?.removeInstrFromSavedNode(unique_id)
        }
    }
}

export class NewTDPModel {
    //#region private variables
    private discovery_list: IInstrInfo[] = []
    private connection_list: IInstrInfo[] = []
    private node_providers: IRootNodeProvider[] = []
    private savedLANNode: LanNode | undefined
    private savedUSBNode: USBNode | undefined
    private savedNode: SavedNode | undefined
    private _savedNodeProvider: SavedNodeProvider | undefined
    private _lanNodeProvider: LanNodeProvider | undefined
    private _usbNodeProvider: USBNodeProvider | undefined
    //#endregion

    //#region constructor
    constructor() {
        //move saveNodeprov to private var
        this._savedNodeProvider = new SavedNodeProvider()
        this._lanNodeProvider = new LanNodeProvider()
        this._usbNodeProvider = new USBNodeProvider()
        this.node_providers.push(this._savedNodeProvider)
        this.node_providers.push(this._lanNodeProvider)
        this.node_providers.push(this._usbNodeProvider)
    }
    //#endregion

    //#region public methods

    public getContent(): Thenable<string> {
        return this.connect().then(() => {
            return new Promise(() => {
                rpcClient.requestAdvanced(jsonRPCRequest).then(
                    (jsonRPCResponse: JSONRPCResponse) => {
                        if (jsonRPCResponse.error) {
                            console.log(
                                `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`
                            )
                        } else {
                            const res: unknown = jsonRPCResponse.result
                            if (typeof res === "string") {
                                console.log("JSON RPC Instr list: " + res)
                                const instrList = res.split("\n")
                                //need to remove the last newline element??
                                instrList?.forEach((instr) => {
                                    if (instr.length > 0) {
                                        const obj = JSON.parse(
                                            instr
                                        ) as IInstrInfo
                                        if (
                                            !this.discovery_list.some(
                                                (e) =>
                                                    e.io_type == obj.io_type &&
                                                    e.serial_number ==
                                                        obj.serial_number
                                            )
                                        ) {
                                            this.discovery_list.push(obj)
                                        }
                                    }
                                })
                            }
                        }
                    },
                    () => {
                        console.log("RPC Instr List Fetch failed!")
                    }
                )
                //todo
            })
        })
    }

    public getChildren(node: InstrNode): InstrNode[] {
        return node.children
    }

    public roots(): Thenable<InstrNode[]> {
        //dynamic tree creation
        return this.connect().then(() => {
            return new Promise((c) => {
                const nodeItems: InstrNode[] = []
                if (
                    this.discovery_list.length < 0 &&
                    this.connection_list.length < 0
                ) {
                    return c(nodeItems)
                }

                this.connection_list.forEach((instr) => {
                    const ret =
                        this._savedNodeProvider?.GetInstrumentNode(instr)
                    if (ret != undefined) {
                        if (!nodeItems.includes(ret)) {
                            nodeItems.push(ret)
                        }
                    }
                })

                for (const node_provider of this.node_providers) {
                    this.discovery_list.forEach((instr) => {
                        const ret = node_provider.GetInstrumentNode(
                            instr,
                            false
                        )
                        if (ret != undefined) {
                            if (!nodeItems.includes(ret)) {
                                nodeItems.push(ret)
                            }
                        }
                    })
                }

                return c(nodeItems)
            })
        })
    }

    //add from connect
    public addFromConnectToSavedList(
        instr_to_save: string,
        ioType: IoType,
        instr_details: unknown
    ) {
        if (instr_to_save.length > 0) {
            const instr_info = instr_details as IInstrInfo
            this._savedNodeProvider?.saveInstrToList(instr_to_save)
            this.connection_list.push(instr_info) //check for redundant entries

            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            if (ioType == IoType.Lan) {
                this._lanNodeProvider?.updateSavedList(saved_list ?? [], true)
            } else {
                this._usbNodeProvider?.updateSavedList(saved_list ?? [], true)
            }
        }
    }

    public addSavedList(instr: unknown) {
        const nodeToBeSaved = instr as IOInstrNode
        if (nodeToBeSaved != undefined) {
            this._savedNodeProvider?.saveInstrToList(
                nodeToBeSaved.FetchUniqueID() ?? ""
            )

            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            if (nodeToBeSaved.FetchInstrIOType() == IoType.Lan) {
                this._lanNodeProvider?.updateSavedList(saved_list ?? [], true)
            } else {
                this._usbNodeProvider?.updateSavedList(saved_list ?? [], true)
            }
        }
    }

    public removeSavedList(instr: unknown) {
        const nodeToBeRemoved = instr as IOInstrNode
        if (nodeToBeRemoved != undefined) {
            let idx = -1
            for (let i = 0; i < this.connection_list.length; i++) {
                const uid = DiscoveryHelper.createUniqueID(
                    this.connection_list[i]
                )
                if (uid == nodeToBeRemoved.FetchUniqueID()) {
                    idx = i
                    break
                }
            }

            if (idx > -1) {
                this.connection_list.splice(idx, 1)
            }

            this._savedNodeProvider?.removeInstrFromList(
                nodeToBeRemoved.FetchUniqueID() ?? ""
            )

            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            if (nodeToBeRemoved.FetchInstrIOType() == IoType.Lan) {
                this._lanNodeProvider?.updateSavedList(saved_list ?? [], false)
            } else {
                this._usbNodeProvider?.updateSavedList(saved_list ?? [], false)
            }
        }
    }
    //#endregion

    //#region private methods
    private connect(): Thenable<undefined> {
        return new Promise((c) => {
            c(void 0)
        })
    }

    // private updateSavedLanNode(lanInstr: IInstrInfo) {
    //     //this.savedLANNode?.AddInstrument(lanInstr)
    // }

    // private getSavedLanNode(lanInstr: IInstrInfo): LanNode {
    //     if (this.savedLANNode == undefined) {
    //         this.savedLANNode = new LanNode()
    //     }
    //     //this.savedLANNode.AddInstrument(lanInstr)

    //     return this.savedLANNode
    // }

    // private updateSavedUSBNode(usbInstr: IInstrInfo) {
    //     //this.savedUSBNode?.AddInstrument(usbInstr)
    // }

    // private getsavedUSBNode(usbInstr: IInstrInfo): USBNode {
    //     if (this.savedUSBNode == undefined) {
    //         this.savedUSBNode = new USBNode()
    //     }
    //     //this.savedUSBNode.AddInstrument(usbInstr)

    //     return this.savedUSBNode
    // }
    //#endregion
}

type newTDP = vscode.TreeDataProvider<InstrNode>

export class InstrTDP implements newTDP {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _onDidChangeTreeData: vscode.EventEmitter<any> =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new vscode.EventEmitter<any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly onDidChangeTreeData: vscode.Event<any> =
        this._onDidChangeTreeData.event

    private instrModel: NewTDPModel | undefined
    constructor(model: NewTDPModel) {
        this.instrModel = model
    }
    getTreeItem(
        element: InstrNode
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let expandableState = vscode.TreeItemCollapsibleState.None

        //Created TSP-481 to focus the newly connected instrument info in "Instruments" pane
        if (element.children.length > 0) {
            if (element.isExpandable) {
                expandableState = vscode.TreeItemCollapsibleState.Expanded
            } else {
                expandableState = vscode.TreeItemCollapsibleState.Collapsed
            }
        } else {
            expandableState = vscode.TreeItemCollapsibleState.None
        }

        const treeItem = new vscode.TreeItem(element.label, expandableState)

        if (element.children.length > 0) {
            const main_node = element as IOInstrNode
            //ToDo: showNestedMenu used to identify IOInstrNode
            if (main_node != undefined && main_node.showNestedMenu) {
                let cv = ""
                if (main_node.FetchSaveStatus() == false) {
                    cv = "NotSaved"
                } else {
                    cv = "ToRemove"
                }

                const categ = main_node.FetchInstrCateg()

                cv += categ?.includes("versatest")
                    ? "VersatestInstr"
                    : "RegInstr"

                treeItem.contextValue = cv
                return treeItem
            } else {
                return treeItem
            }
        } else {
            return treeItem
        }
    }

    getChildren(
        element?: InstrNode | undefined
    ): vscode.ProviderResult<InstrNode[]> {
        return element
            ? this.instrModel?.getChildren(element)
            : this.instrModel?.roots()
    }

    public refresh(): void {
        void this.instrModel?.getContent()
        this.reloadTreeData()
    }

    public saveInstrument(instr: unknown): void {
        this.instrModel?.addSavedList(instr)
        this.reloadTreeData()
    }

    public saveInstrumentFromConnect(
        instr_to_save: string,
        ioType: IoType,
        instr_details: unknown
    ): void {
        this.instrModel?.addFromConnectToSavedList(
            instr_to_save,
            ioType,
            instr_details
        )
        this.reloadTreeData()
    }

    public removeInstrument(instr: unknown): void {
        this.instrModel?.removeSavedList(instr)
        this.reloadTreeData()
    }

    public reloadTreeData() {
        setTimeout(() => {
            this._onDidChangeTreeData.fire(undefined)
        }, 200)
    }
}

export class InstrumentsExplorer {
    private InstrumentsDiscoveryViewer: vscode.TreeView<InstrNode>
    private treeDataProvider?: InstrTDP
    private intervalID?: NodeJS.Timeout
    private _kicProcessMgr: KicProcessMgr

    constructor(
        context: vscode.ExtensionContext,
        kicProcessMgr: KicProcessMgr
    ) {
        this._kicProcessMgr = kicProcessMgr
        const tdpModel = new NewTDPModel()
        const treeDataProvider = new InstrTDP(tdpModel)

        this.InstrumentsDiscoveryViewer =
            vscode.window.createTreeView<InstrNode>("InstrumentsExplorer", {
                treeDataProvider,
            })

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.startDiscovery()
        })
        vscode.commands.registerCommand(
            "InstrumentsExplorer.openInstrumentsDiscoveryResource",
            () => void 0
        )
        vscode.commands.registerCommand(
            "InstrumentsExplorer.revealResource",
            () => void 0
        )

        const upgradefw = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeFirmware",
            async (e) => {
                await this.upgradeFirmware(e)
            }
        )

        const upgradeMainframe = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeMainframe",
            async (e) => {
                await this.upgradeMainframe(e)
            }
        )

        const upgradeSlot1 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot1",
            async (e) => {
                await this.upgradeSlot1(e)
            }
        )

        const upgradeSlot2 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot2",
            async (e) => {
                await this.upgradeSlot2(e)
            }
        )

        const upgradeSlot3 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot3",
            async (e) => {
                await this.upgradeSlot3(e)
            }
        )

        const saveInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.save",
            (e) => {
                this.saveInstrument(e)
            }
        )

        const removeInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.remove",
            (e) => {
                this.removeInstrument(e)
            }
        )

        context.subscriptions.push(upgradefw)
        context.subscriptions.push(upgradeMainframe)
        context.subscriptions.push(upgradeSlot1)
        context.subscriptions.push(upgradeSlot2)
        context.subscriptions.push(upgradeSlot3)
        context.subscriptions.push(saveInstrument)
        context.subscriptions.push(removeInstrument)

        this.startDiscovery()
    }

    private startDiscovery() {
        if (this.InstrumentsDiscoveryViewer.description == undefined) {
            cp.spawn(
                DISCOVER_EXECUTABLE,
                ["all", "--timeout", DISCOVERY_TIMEOUT.toString(), "--exit"]
                //,
                // {
                //     detached: true,
                //     stdio: "ignore",
                // }
            )

            //subprocess.unref()

            this.InstrumentsDiscoveryViewer.description =
                "Instruments Discovery in progress"

            //this.treeDataProvider?.clear()

            this.intervalID = setInterval(() => {
                this.treeDataProvider?.refresh()
            }, 1000)

            setTimeout(() => {
                this.InstrumentsDiscoveryViewer.description = undefined
                clearInterval(this.intervalID)
                //void stopDiscovery()
            }, DISCOVERY_TIMEOUT * 1000 + 10000)
        }
    }

    public async rename(item: object) {
        //if (typeof item === typeof InstrDiscoveryNode) {
        const input_item = item as IOInstrNode
        const ip_str = await vscode.window.showInputBox({
            placeHolder: "Enter new friendly name",
        })
        if (
            ip_str !== null &&
            ip_str !== undefined &&
            ip_str.length > 0 &&
            input_item != undefined
        ) {
            if (
                FriendlyNameMgr.handleFriendlyName(
                    input_item.FetchInstrIOType(),
                    input_item.fetchModelSerial(),
                    ip_str,
                    input_item.FetchConnectionAddr()
                )
            ) {
                input_item.checkForFriendlyName()
                this.treeDataProvider?.reloadTreeData()
            }
        }
    }

    public fetchConnectionArgs(item: object): [string, boolean, string?] {
        const resNode = item as IOInstrNode
        if (resNode != undefined) {
            const conn_name =
                resNode.label + "@" + resNode.FetchConnectionAddr()
            if (resNode.FetchInstrIOType() == IoType.Lan) {
                return [conn_name, true]
            } else {
                return [conn_name, true, resNode.fetchModelSerial()]
            }
        }
        return ["", false]
    }

    private async upgradeFirmware(_e: unknown) {
        await this.genericUpgradeFW(_e, 0)
    }

    public saveWhileConnect(
        instr_to_save: string,
        ip: string,
        ioType: IoType,
        info: string,
        port: string | undefined
    ) {
        if (info == "") {
            void vscode.window.showErrorMessage(
                "Unable to connect to instrument"
            )
            return
        }

        const _info = <IIDNInfo>JSON.parse(info)
        const __info: IInstrInfo = {
            io_type: ioType,
            ip_addr: ip,
            socket_port: port,
            manufacturer: _info.vendor,
            model: _info.model,
            serial_number: _info.serial_number,
            firmware_revision: _info.firmware_rev,
            instr_categ: "",
        }

        const categ = instr_map.get(_info.model)
        if (categ != undefined) __info.instr_categ = categ

        this.treeDataProvider?.saveInstrumentFromConnect(
            instr_to_save,
            ioType,
            __info
        )
    }

    private saveInstrument(instr: unknown) {
        this.treeDataProvider?.saveInstrument(instr)
    }

    //from connect

    private removeInstrument(instr: unknown) {
        this.treeDataProvider?.removeInstrument(instr)
    }

    private async upgradeMainframe(_e: unknown) {
        await this.genericUpgradeFW(_e, 0)
    }

    private async upgradeSlot1(_e: unknown) {
        await this.genericUpgradeFW(_e, 1)
    }

    private async upgradeSlot2(_e: unknown) {
        await this.genericUpgradeFW(_e, 2)
    }

    private async upgradeSlot3(_e: unknown) {
        await this.genericUpgradeFW(_e, 3)
    }

    /**
     * Common method to upgrade firmware/mainframe/slots
     * @param _e - tree item showing the menu
     * @param is_module - whether instrument contains a module or not
     * @param slot - the slot to upgrade if any
     */
    private async genericUpgradeFW(_e: unknown, slot = 0) {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })
        if (kicTerminals.length == 0) {
            void vscode.window.showInformationMessage(
                "Not connected to any instrument. Cannot proceed."
            )
            return
        } else {
            const inputNode = _e as IOInstrNode

            for (const kicCell of this._kicProcessMgr.kicList) {
                if (inputNode != undefined) {
                    if (
                        inputNode.FetchConnectionAddr() ==
                        kicCell.fetchConnAddr()
                    ) {
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
                                `.update "${fw_file[0].fsPath}" --slot ${slot}\n
                                `
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
    public static createUniqueID(info: IInstrInfo): string {
        let res = ""
        res =
            info.io_type.toString() +
            ":" +
            info.model +
            "#" +
            info.serial_number
        return res
    }
}
