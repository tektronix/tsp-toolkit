import * as fs from "fs"
import { join } from "path"
import child from "child_process"
import { tmpdir } from "node:os"
import { mkdtempSync } from "fs"
import * as vscode from "vscode"
import { COMMAND_SETS } from "@tektronix/keithley_instrument_libraries"
import { EXECUTABLE } from "./kic-cli"
import { CommunicationManager } from "./communicationmanager"
//import { TerminationManager } from "./terminationManager"
import { Connection, Instrument, InstrumentsExplorer } from "./instruments"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import {
    ConnectionDetails,
    ConnectionHelper,
    FriendlyNameMgr,
    IIDNInfo,
    IoType,
    KicProcessMgr,
} from "./resourceManager"
import {
    getClassName,
    getNodeDetails,
    updateNodeDetails,
} from "./tspConfigJsonParser"
import {
    configure_initial_workspace_configurations,
    processWorkspaceFolders,
    RELATIVE_TSP_CONFIG_FILE_PATH,
    updateConfiguration,
} from "./workspaceManager"
import { Log, SourceLocation } from "./logging"
import { LOG_DIR } from "./utility"

let _activeConnectionManager: CommunicationManager
//let _terminationMgr: TerminationManager
let _instrExplorer: InstrumentsExplorer
let _kicProcessMgr: KicProcessMgr

/**
 * Function will create terminal with given connection details
 * @param connection_string connection string example 'tsPop@127.0.0.1'
 * @param model_serial model serial number
 * @param command_text command text that needs to send to terminal
 * @returns None
 */
export async function createTerminal(
    connection_string: string,
): Promise<boolean> {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: `createTerminal("${connection_string}")`,
    }
    //'example@5e6:2461@2' OR 'example@127.0.0.1'
    const connection_details =
        ConnectionHelper.parseConnectionString(connection_string)

    if (!connection_details) {
        return Promise.reject(new Error("Unable to parse connection string"))
    }

    Log.debug(
        `Connection type was determined to be ${connection_details.type.toUpperCase()}`,
        LOGLOC,
    )
    //LAN
    Log.trace("Creating terminal", LOGLOC)
    await vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: "Connecting to instrument",
        },
        async (progress, cancel) => {
            let background_process: child.ChildProcess | undefined = undefined

            cancel.onCancellationRequested(() => {
                Log.info("Connection cancelled by user", LOGLOC)
                if (background_process) {
                    background_process?.kill("SIGTERM")
                }
            })
            //Dump output queue if enabled
            if (cancel.isCancellationRequested) {
                return new Promise((resolve) => resolve(false))
            }

            let dump_path: string | undefined = undefined
            if (
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("dumpQueueOnConnect") === true
            ) {
                progress.report({
                    message: "Dumping data from instrument output queue",
                })
                Log.info("Dumping data from instrument output queue", LOGLOC)
                const dump_dir = mkdtempSync(join(tmpdir(), "tsp-toolkit-"))
                dump_path = join(dump_dir, "dump-output")

                Log.trace(`Dumping data to ${dump_path}`, LOGLOC)

                background_process = child.spawn(EXECUTABLE, [
                    "--log-file",
                    join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`,
                    ),
                    "dump",
                    connection_details.type.toLowerCase(),
                    connection_details.addr,
                    "--output",
                    dump_path,
                ])

                await new Promise<void>((resolve) => {
                    background_process?.on("close", () => {
                        Log.trace(
                            `Dump process exited with code: ${background_process?.exitCode}`,
                            LOGLOC,
                        )
                        resolve()
                    })
                })
            }

            //Get instrument info
            progress.report({
                message: "Getting instrument information",
            })
            Log.trace("Getting instrument information", LOGLOC)

            if (cancel.isCancellationRequested) {
                return new Promise((resolve) => resolve(false))
            }
            background_process = child.spawn(
                EXECUTABLE,
                [
                    "--log-file",
                    join(
                        LOG_DIR,
                        `${new Date().toISOString().substring(0, 10)}-kic.log`,
                    ),
                    "info",
                    connection_details.type.toLowerCase(),
                    "--json",
                    connection_details.addr,
                ],
                {
                    env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
                },
            )
            const info_string = await new Promise<string>((resolve) => {
                let data = ""
                background_process?.stderr?.on("data", (chunk) => {
                    Log.trace(`Info stderr: ${chunk}`, LOGLOC)
                })
                background_process?.stdout?.on("data", (chunk) => {
                    Log.trace(`Info process received: ${chunk}`, LOGLOC)
                    data += chunk
                })
                background_process?.on("close", () => {
                    Log.trace(
                        `Info process exited with code: ${background_process?.exitCode}`,
                        LOGLOC,
                    )
                    resolve(data)
                })
            })
            const exit_code = background_process.exitCode

            Log.trace(
                `Info process exited with code: ${exit_code}, information: ${info_string.trim()}`,
                LOGLOC,
            )

            if (info_string == "") {
                Log.error(
                    `Unable to connect to instrument at ${connection_details.addr}: could not get instrument information`,
                    LOGLOC,
                )
                vscode.window.showErrorMessage(
                    `Unable to connect to instrument at ${connection_details.addr}: could not get instrument information`,
                )
                return new Promise((resolve) => resolve(false))
            }

            const info = <IIDNInfo>JSON.parse(info_string)

            const inst = new Instrument(
                info,
                connection_details.name != ""
                    ? connection_details.name
                    : undefined,
            )
            connection_details.name = inst.name

            const additional_terminal_args = []

            if (dump_path) {
                Log.trace(`Showing dump content from ${dump_path}`, LOGLOC)
                additional_terminal_args.push("--dump-output", dump_path)
            }

            progress.report({
                message: `Connecting to instrument with model ${info.model} and S/N ${info.serial_number}`,
            })

            //Connect terminal
            if (cancel.isCancellationRequested) {
                return new Promise((resolve) => resolve(false))
            }
            await _activeConnectionManager?.createTerminal(
                connection_details.name,
                connection_details.type,
                connection_details.addr,
                additional_terminal_args,
            )

            Log.trace(`Connected to ${connection_details.name}`, LOGLOC)

            progress.report({
                message: `Connected to instrument with model ${info.model} and S/N ${info.serial_number}, saving to global settings`,
            })
            Log.trace("Saving connection", LOGLOC)
            await _instrExplorer.saveWhileConnect(inst)
        },
    )
    return Promise.resolve(true)
}

// Called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    const LOGLOC: SourceLocation = { file: "extension.ts", func: "activate()" }
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    Log.info("TSP Toolkit activating", LOGLOC)

    Log.trace("Updating extension settings", LOGLOC)
    updateExtensionSettings()

    Log.trace("Starting ConnectionHelper", LOGLOC)

    Log.trace("Starting KicProcessMgr", LOGLOC)
    _kicProcessMgr = new KicProcessMgr()

    // Create an object of Communication Manager
    Log.trace("Starting CommunicationManager", LOGLOC)
    _activeConnectionManager = new CommunicationManager(context, _kicProcessMgr)
    //_terminationMgr = new TerminationManager()
    Log.trace("Creating new InstrumentExplorer", LOGLOC)
    _instrExplorer = new InstrumentsExplorer(context, _kicProcessMgr)

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    Log.trace("Registering `tsp.openTerminal` command", LOGLOC)
    const openTerminal = vscode.commands.registerCommand(
        "tsp.openTerminal",
        pickConnection,
    )

    Log.trace("Registering `InstrumentExplorer.connect` command", LOGLOC)
    const add_new_connection = vscode.commands.registerCommand(
        "InstrumentsExplorer.connect",
        async () => {
            await pickConnection("New Connection")
        },
    )

    Log.trace("Setting up HelpDocumentWebView", LOGLOC)
    context.subscriptions.push(add_new_connection)

    HelpDocumentWebView.createOrShow(context)

    //TODO: connect `.terminate` in ki-comms
    // const terminateAll = vscode.commands.registerCommand(
    //     "tsp.terminateAll",
    //     startTerminateAllConn
    // )

    //TODO add the following back into the package.json file after terminate is added to ki-comms
    /*
            {
                "command": "tsp.terminateAll",
                "title": "Terminate All Existing Connections to an Instrument",
                "category": "TSP"
            },
    */

    Log.trace("Registering `tsp.openTerminalIP` command", LOGLOC)
    vscode.commands.registerCommand("tsp.openTerminalIP", connectCmd)

    Log.trace("Registering `InstrumentExplorer.rename` command", LOGLOC)
    vscode.commands.registerCommand(
        "InstrumentsExplorer.rename",
        async (e: Instrument) => {
            await startRename(e)
        },
    )

    vscode.commands.registerCommand(
        "InstrumentsExplorer.reset",
        async (e: Connection) => {
            await startReset(e)
        },
    )

    context.subscriptions.push(openTerminal)

    //TODO: Connect `.terminate` in ki-comms
    //context.subscriptions.push(terminateAll) TODO: This isn't connected in ki-comms...
    //context.subscriptions.push(rclick)

    Log.trace(
        "Checking to see if workspace folder contains `*.tsp` files",
        LOGLOC,
    )
    // call function which is required to call first time while activating the plugin
    void processWorkspaceFolders()

    Log.trace("Update local and global configuration for TSP", LOGLOC)
    void configure_initial_workspace_configurations()
    Log.trace(
        "Subscribing to TSP configuration changes in all workspace folders",
        LOGLOC,
    )
    hookTspConfigFileChange(context, vscode.workspace.workspaceFolders?.slice())

    // Register a handler to process files whenever file is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((textFilePath) => {
            void onDidSaveTextDocument(textFilePath)
        }),
    )
    // Register a handler to process files whenever a new workspace folder is added
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            hookTspConfigFileChange(context, event.added.slice())
            void processWorkspaceFolders()
        }),
    )

    // Register a handler to process files whenever a file is created is added
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => {
            void processWorkspaceFolders()
        }),
    )

    Log.info("TSP Toolkit activation complete", LOGLOC)

    return base_api
}

// Called when the extension is deactivated.
export function deactivate() {
    const LOGLOC = { file: "extensions.ts", func: "deactivate()" }
    Log.info("Deactivating TSP Toolkit", LOGLOC)
    Log.trace("Closing all kic executables", LOGLOC)
    _kicProcessMgr.dispose().then(
        () => {
            Log.info("Deactivation complete", LOGLOC)
        },
        () => {
            Log.error("Deactivation had errors.")
        },
    )
}

//Request the instrument to be reset
function startReset(def: Connection): Promise<void> {
    return Promise.resolve(_instrExplorer.reset(def))
}

function updateExtensionSettings() {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "updateExtensionSettings()",
    }
    const settingsList = ["connectionList", "savedInstrumentList"]
    settingsList.forEach((setting) => {
        if (vscode.workspace.getConfiguration("tsp").get(setting)) {
            console.log(setting)
            Log.warn(`Found deprecated setting: \`${setting}\``, LOGLOC)
            void vscode.window
                .showInformationMessage(
                    setting +
                        ' is deprecated. Select "Remove" to remove it from settings.json. If you wish to leave it, select "Ignore"',
                    ...["Remove", "Ignore"],
                )
                .then((selection) => {
                    if (selection == "Remove") {
                        Log.info(
                            `User chose to remove \`${setting}\`. Removing.`,
                            LOGLOC,
                        )
                        void vscode.workspace
                            .getConfiguration("tsp")
                            .update(setting, undefined, true)
                            .then(() => {
                                Log.info(
                                    `Setting \`${setting}\` removed`,
                                    LOGLOC,
                                )
                                void vscode.window.showInformationMessage(
                                    "removed setting: " + setting,
                                )
                            })
                    }
                })
        }
    })
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
    workspace_folders: vscode.WorkspaceFolder[] | undefined,
) {
    if (workspace_folders) {
        for (const folder of workspace_folders) {
            const folderPath = folder.uri

            const fileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folderPath, "**/*.tsp.json"),
            )
            // Event listener for file changes
            fileWatcher.onDidChange(onDidChangeTspConfigFile)
            fileWatcher.onDidCreate(onDidChangeTspConfigFile)

            context.subscriptions.push(fileWatcher)
        }
    }
}

/**
 * Event listener for ".vscode/tspConfig/config.tsp.json"
 * @param uri text file uri
 */
export async function onDidChangeTspConfigFile(uri: vscode.Uri) {
    void onDidSaveTextDocument(await vscode.workspace.openTextDocument(uri))
}

/**
 * Event listener for save text document event
 * check for file path if its ".vscode/tspConfig/config.tsp.json"
 * then read the file and fetch node details form it
 * update the library path in setting.json file of selected workspace folder
 * @param textDocument text document path
 */
async function onDidSaveTextDocument(textDocument: vscode.TextDocument) {
    // Perform actions when a text document is saved
    const workspace_path = vscode.workspace.getWorkspaceFolder(textDocument.uri)
    const filePath = textDocument.uri.fsPath
    if (filePath.endsWith("config.tsp.json") && fs.existsSync(filePath)) {
        const nodeDetails = getNodeDetails(filePath)
        const new_library_settings: string[] = []
        let nodeStr = ""
        for (const [model, nodes] of Object.entries(nodeDetails)) {
            // supported model
            const supported_models = fs
                .readdirSync(COMMAND_SETS)
                .filter((folder) =>
                    fs.statSync(`${COMMAND_SETS}/${folder}`).isDirectory(),
                )
            if (!supported_models.includes(model.toUpperCase())) {
                void vscode.window.showInformationMessage(
                    `${model} model is not supported`,
                )
                if (workspace_path)
                    await updateConfiguration(
                        "Lua.workspace.library",
                        [join(COMMAND_SETS, "tsp-lua-5.0")],
                        vscode.ConfigurationTarget.WorkspaceFolder,
                        workspace_path,
                        false,
                    )
                return
            }
            const lib_base_path = join(COMMAND_SETS, model.toUpperCase())

            new_library_settings.push(join(lib_base_path, "Helper"))
            if (nodes.some((str) => str.includes("self"))) {
                new_library_settings.push(join(lib_base_path, "AllTspCommands"))
            }
            if (nodes.some((str) => str.includes("node"))) {
                new_library_settings.push(
                    join(lib_base_path, "tspLinkSupportedCommands"),
                )
            }
            const className = getClassName(
                join(
                    lib_base_path,
                    "tspLinkSupportedCommands",
                    "nodeTable.lua",
                ),
            )
            nodes.forEach((node: string) => {
                if (node.includes(".")) {
                    // slot configuration can be handled here
                } else {
                    if (node.includes("node")) {
                        const node_num = parseInt(
                            node.match(/\d+/)?.[0] || "",
                            10,
                        )
                        nodeStr =
                            nodeStr + `node[${node_num}] =  ${className}\n`
                    }
                }
            })
        }

        // open workspace nodeTable.lua file and update node details in it

        if (workspace_path != undefined) {
            updateNodeDetails(
                join(
                    workspace_path.uri.fsPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "nodeTable.tsp",
                ),
                nodeStr,
            )
            new_library_settings.push(join(COMMAND_SETS, "tsp-lua-5.0")) // including Lua 5.0 definitions folder path
            await updateConfiguration(
                "Lua.workspace.library",
                new_library_settings,
                vscode.ConfigurationTarget.WorkspaceFolder,
                workspace_path,
                true,
            )
        }
    }
}

async function pickConnection(connection_info?: string): Promise<void> {
    const connections: string[] = FriendlyNameMgr.fetchConnListForPicker()

    if (connection_info !== undefined) {
        const options: vscode.InputBoxOptions = {
            prompt: "Enter instrument IP address or VISA resource string",
            validateInput: ConnectionHelper.instrConnectionStringValidator,
        }
        const Ip = await vscode.window.showInputBox(options)
        if (Ip === undefined) {
            return
        }
        await connect(Ip)
    } else {
        const options: vscode.QuickPickItem[] = connections.map(
            (connection) => ({
                label: connection,
            }),
        )
        const quickPick = vscode.window.createQuickPick()
        quickPick.items = options
        quickPick.placeholder = "Enter instrument IP in <insName>@<IP> format"
        if (options.length > 0) {
            quickPick.placeholder =
                "Select connection from existing list or enter instrument IP in <insName>@<IP> format"
        }

        quickPick.onDidChangeValue((value) => {
            if (!options.some((option) => option.label === value)) {
                const new_item = { label: value }
                if (new_item.label.length > 0) {
                    quickPick.items = [new_item, ...options]
                }
            }
        })

        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0]
            quickPick.busy = true
            try {
                // Validate connection string
                const validationResult =
                    ConnectionHelper.instrConnectionStringValidator(
                        selectedItem.label,
                    )
                if (validationResult) {
                    throw new Error(validationResult)
                }

                if (
                    options.some(
                        (option) => option.label === selectedItem.label,
                    )
                ) {
                    await createTerminal(selectedItem.label)
                } else {
                    const Ip = selectedItem.label
                    if (Ip === undefined) {
                        return
                    }
                    await connect(Ip)
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${(error as Error).message}`,
                )
            } finally {
                quickPick.busy = false
                quickPick.hide()
            }
        })

        quickPick.show()
    }
}

async function connect(inIp: string, shouldPrompt?: boolean): Promise<void> {
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
        await createTerminal(Ip)
    } else {
        void vscode.window.showErrorMessage("Bad connection string")
    }
    return
}

//function startTerminateAllConn() {
//    void _terminationMgr.terminateAllConn()
//}

async function startRename(def: Instrument): Promise<void> {
    await _instrExplorer.rename(def)
}

function connectCmd(def: Connection) {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: `connectCmd(${String(def)})`,
    }

    Log.trace("Fetching connection args", LOGLOC)
    const connection_str = def.addr
    Log.trace(`Connection string: '${connection_str}'`, LOGLOC)

    if (_activeConnectionManager?.connectionRE.test(connection_str)) {
        Log.trace("Connection string is valid. Creating Terminal", LOGLOC)
        void createTerminal(connection_str)
    } else {
        Log.error(
            "Connection string is invalid. Unable to connect to instrument.",
            LOGLOC,
        )
        void vscode.window.showErrorMessage(
            `Unable to connect. "${connection_str}" is not a valid connection string.`,
        )
    }
}

const base_api = {
    fetchKicTerminals(): vscode.Terminal[] {
        const kicTerminals = vscode.window.terminals.filter(
            (t) =>
                (
                    t.creationOptions as vscode.TerminalOptions
                )?.shellPath?.toString() === EXECUTABLE,
        )
        return kicTerminals
    },

    async fetchConnDetails(
        term_pid: Thenable<number | undefined> | undefined,
    ): Promise<ConnectionDetails | undefined> {
        if (_kicProcessMgr != undefined) {
            const kicCell = _kicProcessMgr.kicList.find(
                (x) => x.terminalPid == term_pid,
            )

            const connDetails = kicCell?.connDetails
            kicCell?.sendTextToTerminal(".exit")
            let found = false
            await kicCell?.getTerminalState().then(
                () => {
                    found = true
                },
                () => {
                    found = false
                },
            )
            if (found) {
                return Promise.resolve(connDetails)
            }
            return Promise.reject(
                new Error(
                    "Couldn't close terminal. Please check instrument state",
                ),
            )
        }
    },

    async restartConnAfterDbg(instr: ConnectionDetails) {
        if (instr != undefined) {
            await _kicProcessMgr.createKicCell(
                instr.Name,
                instr.ConnAddr,
                instr.ConnType as IoType,
                [],
            )
        }
    },
}
