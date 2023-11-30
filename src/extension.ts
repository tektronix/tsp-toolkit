import * as fs from "fs"
import * as vscode from "vscode"
import { COMMAND_SETS } from "@tek-engineering/keithley_instrument_libraries"
import { EXECUTABLE } from "@tek-engineering/kic-cli"
import { CommunicationManager } from "./communicationmanager"
import { TerminationManager } from "./terminationManager"
import { InstrumentsExplorer } from "./instruments"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import {
    ConnectionDetails,
    ConnectionHelper,
    FriendlyNameMgr,
    IoType,
    KicProcessMgr,
} from "./resourceManager"
import {
    getClassName,
    getNodeDetails,
    setLuaWorkspaceLibrary,
    updateNodeDetails,
} from "./tspConfigJsonParser"
import { processWorkspaceFolders } from "./workspaceManager"

let _activeConnectionManager: CommunicationManager
let _terminationMgr: TerminationManager
let _instrExplorer: InstrumentsExplorer
let _kicProcessMgr: KicProcessMgr
let _connHelper: ConnectionHelper

/**
 * Function will create terminal with given connection details
 * @param connection_string connection string example 'tsPop@127.0.0.1'
 * @param model_serial model serial number
 * @param command_text command text that needs to send to terminal
 * @returns None
 */
export async function createTerminal(
    connection_string: string,
    model_serial?: string,
    command_text?: string
) {
    //'example@5e6:2461@2' OR 'example@127.0.0.1'
    let info = ""
    let ip = connection_string
    let name = ""
    let msn
    let model_serial_no = ""
    if (connection_string.split("@").length > 1) {
        name = connection_string.split("@")[0]
        ip = connection_string.split("@")[1]
    } else {
        const name_entered = await vscode.window.showInputBox({
            placeHolder: "Enter friendly name to proceed",
        })
        if (
            //ToDo: need to add a common regex for all friendly name inputs
            name_entered === undefined ||
            name_entered === null ||
            name_entered.length === 0
        ) {
            void vscode.window.showErrorMessage(
                "Cannot proceed with empty friendly name"
            )
            return
        } else {
            name = name_entered
        }
    }

    if (_connHelper.IPTest(ip) == false) {
        //USB
        //This only works if selected from Instrument discovery
        if (
            !FriendlyNameMgr.handleFriendlyName(
                IoType.Usb,
                model_serial,
                name,
                ip
            )
        ) {
            return
        }
        info = _activeConnectionManager?.createTerminal(
            undefined,
            connection_string,
            command_text
        )
    } else {
        //LAN
        msn = await _connHelper.getModelAndSerialNumber(ip) //const to let
        if (msn != undefined) {
            model_serial_no = msn.model + "#" + msn.sn //const to let
            if (
                !FriendlyNameMgr.handleFriendlyName(
                    IoType.Lan,
                    model_serial_no,
                    name,
                    ip
                )
            ) {
                return
            }

            void vscode.window.showInformationMessage(
                connection_string +
                    ": Found instrument model " +
                    msn.model +
                    " with S/N: " +
                    msn.sn
            )
            info = _activeConnectionManager?.createTerminal(
                connection_string + msn.port,
                undefined,
                command_text
            )
        }
        //TODO: Remove this else statement once lxi page is ready for versatest
        else {
            info = _activeConnectionManager?.createTerminal(
                connection_string,
                undefined,
                command_text
            )
        }

        const instr_to_save: string = "Lan:" + model_serial_no
        info = info.replace("\n", "")

        _instrExplorer.saveWhileConnect(
            instr_to_save,
            ip,
            IoType.Lan,
            info,
            msn?.port
        )
    }
}

// Called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "tspcomms" is now active!')

    _connHelper = new ConnectionHelper()
    _kicProcessMgr = new KicProcessMgr(_connHelper)

    // Create an object of Communication Manager
    _activeConnectionManager = new CommunicationManager(
        context,
        _kicProcessMgr,
        _connHelper
    )
    _terminationMgr = new TerminationManager()
    _instrExplorer = new InstrumentsExplorer(context, _kicProcessMgr)

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const openTerminal = vscode.commands.registerCommand(
        "kic.openTerminal",
        pickConnection
    )

    HelpDocumentWebView.createOrShow(context)

    //TODO: connect `.terminate` in ki-comms
    // const terminateAll = vscode.commands.registerCommand(
    //     "kic.terminateAll",
    //     startTerminateAllConn
    // )

    //TODO add the following back into the package.json file after terminate is added to ki-comms
    /*
            {
                "command": "kic.terminateAll",
                "title": "Terminate all existing connections to an instrument",
                "category": "KIC"
            },
    */

    vscode.commands.registerCommand("kic.openTerminalIP", connectCmd)
    vscode.commands.registerCommand("InstrumentsExplorer.rename", startRename)

    context.subscriptions.push(openTerminal)
    //TODO: Connect `.terminate` in ki-comms
    //context.subscriptions.push(terminateAll) TODO: This isn't connected in ki-comms...
    //context.subscriptions.push(rclick)

    // call function which is required to call first time while activiting the plugin
    hookTspConfigFileChange(context, vscode.workspace.workspaceFolders?.slice())
    void processWorkspaceFolders()

    // Register a handler to process files whenever file is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((textFilePath) => {
            void onDidSaveTextDocument(textFilePath)
        })
    )
    // Register a handler to process files whenever a new workspace folder is added
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            hookTspConfigFileChange(context, event.added.slice())
            void processWorkspaceFolders()
        })
    )

    // Register a handler to process files whenever a file is created is added
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => {
            void processWorkspaceFolders()
        })
    )

    return base_api
}

// Called when the extension is deactivated.
export function deactivate() {
    /* empty */
}

/**
 * For each workspace folder its creating file watcher for "*config.tsp.json"
 * file so that if its get saved for any other process also its should able to
 * configure language library for that
 * @param context extension context
 * @param workspace_folders workspace folder list
 */
function hookTspConfigFileChange(
    context: vscode.ExtensionContext,
    workspace_folders: vscode.WorkspaceFolder[] | undefined
) {
    if (workspace_folders) {
        for (const folder of workspace_folders) {
            const folderPath = folder.uri

            void onDidChangeTspConfigFile(
                vscode.Uri.file(
                    folder.uri.fsPath + "/.tspConfig/config.tsp.json"
                )
            )
            const fileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folderPath, "**/*.tsp.json")
            )
            // Event listener for file changes
            fileWatcher.onDidChange(onDidChangeTspConfigFile)
            fileWatcher.onDidCreate(onDidChangeTspConfigFile)

            context.subscriptions.push(fileWatcher)
        }
    }
}

/**
 * Event listener for "/.tspConfig/config.tsp.json"
 * @param uri text file uri
 */
async function onDidChangeTspConfigFile(uri: vscode.Uri) {
    void onDidSaveTextDocument(await vscode.workspace.openTextDocument(uri))
}

/**
 * Event listener for save text document event
 * check for file path if its ".tspConfig\\config.tsp.json"
 * then read the file and fetch node details form it
 * update the library path in setting.json file of selected workspace folder
 * @param textDocument text document path
 */
async function onDidSaveTextDocument(textDocument: vscode.TextDocument) {
    // Perform actions when a text document is saved
    const filePath = textDocument.uri.fsPath
    if (
        filePath.endsWith(".tspConfig\\config.tsp.json") &&
        fs.existsSync(filePath)
    ) {
        const nodeDetails = getNodeDetails(filePath)
        const new_library_settings: string[] = []
        let nodeStr = ""
        for (const [model, nodes] of Object.entries(nodeDetails)) {
            const lib_base_path = COMMAND_SETS + "\\" + model
            new_library_settings.push(lib_base_path + "\\Helper")
            if (nodes.some((str) => str.includes("self"))) {
                new_library_settings.push(lib_base_path + "\\AllTspCommands")
            }
            if (nodes.some((str) => str.includes("node"))) {
                new_library_settings.push(
                    lib_base_path + "\\tspLinkSupportedCommands"
                )
            }
            const className = getClassName(
                lib_base_path + "\\tspLinkSupportedCommands\\nodeTable.lua"
            )
            nodes.forEach((node: string) => {
                if (node.includes(".")) {
                    // slot configuration can be handled here
                } else {
                    if (node.includes("node")) {
                        const node_num = parseInt(
                            node.match(/\d+/)?.[0] || "",
                            10
                        )
                        nodeStr =
                            nodeStr + `node[${node_num}] =  ${className}\n`
                    }
                }
            })
        }

        // open workspace nodeTable.lua file and update node details in it

        const workspace_path = vscode.workspace.getWorkspaceFolder(
            textDocument.uri
        )

        if (workspace_path != undefined) {
            updateNodeDetails(
                workspace_path.uri.fsPath + "\\.tspConfig\\nodeTable.tsp",
                nodeStr
            )
            setLuaWorkspaceLibrary(workspace_path, undefined)
            await sleep(1)
            setLuaWorkspaceLibrary(workspace_path, new_library_settings)
        }
    }
}

/**
 * Sleep execution
 * @param seconds number of seconds to sleep
 * @returns promise after timeout
 */
function sleep(seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve()
        }, seconds * 1000)
    })
}

async function pickConnection(): Promise<void> {
    const connections: string[] = FriendlyNameMgr.fetchConnListForPicker()
    const selection = await vscode.window.showQuickPick(
        ["New Connection"].concat(connections)
    )

    if (selection === undefined) {
        return
    }
    if (selection !== "New Connection") {
        await createTerminal(selection)
        return
    }

    const options: vscode.InputBoxOptions = {
        prompt: "Enter instrument IP in <insName>@<IP> format",
        validateInput: _connHelper.instrIPValidator,
    }
    const Ip = await vscode.window.showInputBox(options)
    if (Ip === undefined) {
        return
    }
    return connect(Ip)
}

async function connect(
    inIp: string,
    shouldPrompt?: boolean,
    model_serial?: string
): Promise<void> {
    let Ip: string | undefined = inIp
    if (shouldPrompt == true) {
        const options: vscode.InputBoxOptions = {
            prompt: "Connect to instrument?",
            value: inIp,
        }
        Ip = await vscode.window.showInputBox(options)
    }
    if (Ip === undefined) {
        return
    }

    if (_activeConnectionManager?.connectionRE.test(Ip)) {
        await createTerminal(Ip, model_serial)
    } else {
        void vscode.window.showErrorMessage("Bad connection string")
    }
    return
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function startInstrDiscovery(): Promise<void> {
    const wait_time = await vscode.window.showInputBox({
        prompt: "Input how long to wait for instrument responses",
        value: "15",
    })
    if (wait_time === undefined) {
        return
    }

    if (parseInt(wait_time)) {
        const term = vscode.window.createTerminal({
            name: "Discovery",
            shellPath: EXECUTABLE,
            shellArgs: ["discover", "all", "--timeout", wait_time],
            iconPath: vscode.Uri.file("/keithley-logo.ico"),
        })
        term.show()
    }
}

function startTerminateAllConn() {
    void _terminationMgr.terminateAllConn()
}

function startRename(def: object) {
    void _instrExplorer.rename(def)
}

function connectCmd(def: object) {
    const [res1, res2, res3] = _instrExplorer.fetchConnectionArgs(def)
    //console.log(res1, res2, res3)
    void connect(res1, res2, res3)
}

const base_api = {
    fetchKicTerminals(): vscode.Terminal[] {
        const kicTerminals = vscode.window.terminals.filter(
            (t) =>
                (
                    t.creationOptions as vscode.TerminalOptions
                )?.shellPath?.toString() === EXECUTABLE
        )
        return kicTerminals
    },

    async fetchConnDetails(
        term_pid: Thenable<number | undefined> | undefined
    ): Promise<ConnectionDetails | undefined> {
        if (_kicProcessMgr != undefined) {
            const kicCell = _kicProcessMgr.kicList.find(
                (x) => x.terminalPid == term_pid
            )

            const connDetails = kicCell?.fetchConnDetials()
            kicCell?.sendTextToTerminal(".exit")
            let found = false
            await kicCell?.getTerminalState().then(
                () => {
                    found = true
                },
                () => {
                    found = false
                }
            )
            if (found) {
                return Promise.resolve(connDetails)
            }
            return Promise.reject(
                "Couldn't close terminal. Please check instrument state"
            )
        }
    },

    restartConnAfterDbg(instr: ConnectionDetails) {
        if (instr != undefined) {
            _kicProcessMgr.createKicCell(
                instr.Name,
                instr.ConnAddr,
                instr.ConnType,
                instr.Maxerr
            )
        }
    },
}