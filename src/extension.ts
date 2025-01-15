import * as fs from "fs"
import { join } from "path"
import * as vscode from "vscode"
import { COMMAND_SETS } from "@tektronix/keithley_instrument_libraries"
import { EXECUTABLE } from "./kic-cli"
import {
    Connection,
    Instrument,
    InstrumentProvider,
    InstrumentsExplorer,
} from "./instruments"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import { ConnectionDetails, ConnectionHelper } from "./resourceManager"
import { getNodeDetails } from "./tspConfigJsonParser"
import {
    configure_initial_workspace_configurations,
    processWorkspaceFolders,
    updateConfiguration,
} from "./workspaceManager"
import { Log, SourceLocation } from "./logging"

let _instrExplorer: InstrumentsExplorer

/**
 * Function will create terminal with given connection details
 * @param connection_string connection string example 'tsPop@127.0.0.1'
 * @param model_serial model serial number
 * @param command_text command text that needs to send to terminal
 * @returns None
 */
export async function createTerminal(
    connection: Connection | string,
): Promise<boolean> {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "createTerminal()",
    }
    let name = ""
    //'example@5e6:2461@2' OR 'example@127.0.0.1'
    // Always create a Connection.
    if (typeof connection === "string") {
        const connection_details =
            ConnectionHelper.parseConnectionString(connection)

        if (!connection_details) {
            return Promise.reject(
                new Error("Unable to parse connection string"),
            )
        }
        Log.debug(
            `Connection type was determined to be ${connection_details.type.toUpperCase()}`,
            LOGLOC,
        )
        const existing =
            InstrumentProvider.instance.getConnection(connection_details)

        if (existing) {
            connection = existing
        } else {
            connection = new Connection(
                connection_details.type,
                connection_details.addr,
            )
        }
        name = connection_details.name
    }

    const conn: Connection = connection

    await conn.connect(name)

    //LAN
    return Promise.resolve(true)
}

function registerCommands(
    context: vscode.ExtensionContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commands: { name: string; cb: (...args: any[]) => any; thisArgs?: any }[],
) {
    for (const c of commands) {
        registerCommand(context, c.name, c.cb, c.thisArgs)
    }
}

function registerCommand(
    context: vscode.ExtensionContext,
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (...args: any[]) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArgs?: any,
) {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "registerCommand()",
    }
    Log.debug(`Registering '${name}' command`, LOGLOC)

    context.subscriptions.push(
        vscode.commands.registerCommand(name, cb, thisArgs),
    )
}

// Called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    const LOGLOC: SourceLocation = { file: "extension.ts", func: "activate()" }
    Log.info("TSP Toolkit activating", LOGLOC)

    Log.debug("Updating extension settings", LOGLOC)
    updateExtensionSettings()

    Log.debug("Creating new InstrumentExplorer", LOGLOC)
    _instrExplorer = new InstrumentsExplorer(context)

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    registerCommands(context, [
        { name: "tsp.openTerminal", cb: pickConnection },
        { name: "tsp.openTerminalIP", cb: connectCmd },
        {
            name: "InstrumentsExplorer.connect",
            cb: async () => {
                await pickConnection("New Connection")
            },
        },
        {
            name: "InstrumentsExplorer.showTerm",
            cb: (conn: Connection) => {
                conn.showTerminal()
            },
        },
        {
            name: "InstrumentsExplorer.rename",
            cb: async (e: Instrument) => {
                await startRename(e)
            },
        },
        {
            name: "InstrumentsExplorer.reset",
            cb: async (e: Connection) => {
                await startReset(e)
            },
        },
        {
            name: "InstrumentsExplorer.upgradeFirmware",
            cb: async (e: Instrument) => {
                await e.upgrade()
            },
        },
        {
            name: "tsp.sendFileToAllInstr",
            cb: (e: vscode.Uri) => {
                InstrumentProvider.instance.sendToAllActiveTerminals(e.fsPath)
            },
        },
        {
            name: "tsp.sendFile",
            cb: (e: vscode.Uri) => {
                const term = vscode.window.activeTerminal
                const instrument = InstrumentProvider.instance.instruments.find(
                    (i) => i.name === term?.name,
                )
                if (
                    (term?.creationOptions as vscode.TerminalOptions)
                        .shellPath === EXECUTABLE &&
                    instrument
                ) {
                    instrument.sendScript(e.fsPath)
                }
            },
        },
    ])

    Log.debug("Setting up HelpDocumentWebView", LOGLOC)
    HelpDocumentWebView.createOrShow(context)

    Log.debug(
        "Checking to see if workspace folder contains `*.tsp` files",
        LOGLOC,
    )
    // call function which is required to call first time while activating the plugin
    void processWorkspaceFolders()

    Log.debug("Update local and global configuration for TSP", LOGLOC)
    void configure_initial_workspace_configurations()
    Log.debug(
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
    _instrExplorer.dispose()
    Log.info("Deactivation complete", LOGLOC)
}

//Request the instrument to be reset
function startReset(def: Connection): Promise<void> {
    return Promise.resolve(def.reset())
}

function updateExtensionSettings() {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "updateExtensionSettings()",
    }
    const settingsList = ["connectionList", "savedInstrumentList"]
    settingsList.forEach((setting) => {
        if (vscode.workspace.getConfiguration("tsp").get(setting)) {
            Log.warn(`Found deprecated setting: \`${setting}\``, LOGLOC)
            void vscode.window
                .showInformationMessage(
                    setting +
                        ' is deprecated. Select "Remove" to remove it from settings.json. If you wish to leave it, select "Ignore"',
                    ...["Remove", "Ignore"],
                )
                .then((selection) => {
                    if (selection === "Remove") {
                        Log.info(
                            `User chose to remove \`${setting}\`. Removing.`,
                            LOGLOC,
                        )
                        void vscode.workspace
                            .getConfiguration("tsp")
                            .update(
                                setting,
                                undefined,
                                vscode.ConfigurationTarget.Global,
                            )
                            .then(() => {
                                Log.info(
                                    `Setting \`${setting}\` removed from Global settings`,
                                    LOGLOC,
                                )
                                void vscode.window.showInformationMessage(
                                    "Removed deprecated setting: " + setting,
                                )
                            })
                        void vscode.workspace
                            .getConfiguration("tsp")
                            .update(
                                setting,
                                undefined,
                                vscode.ConfigurationTarget.Workspace,
                            )
                            .then(() => {
                                Log.info(
                                    `Setting \`${setting}\` removed from workspace`,
                                    LOGLOC,
                                )
                            })
                        void vscode.workspace
                            .getConfiguration("tsp")
                            .update(
                                setting,
                                undefined,
                                vscode.ConfigurationTarget.WorkspaceFolder,
                            )
                            .then(() => {
                                Log.info(
                                    `Setting \`${setting}\` removed from workspace folder`,
                                    LOGLOC,
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
    const workspace_path = vscode.workspace.getWorkspaceFolder(textDocument.uri)
    const filePath = textDocument.uri.fsPath

    if (
        filePath.endsWith("config.tsp.json") &&
        fs.existsSync(filePath) &&
        workspace_path
    ) {
        const new_library_settings: string[] = []
        new_library_settings.push(join(COMMAND_SETS, "tsp-lua-5.0"))

        const lua_definitions_folder_path = join(
            COMMAND_SETS,
            "nodes_definitions",
        )
        if (fs.existsSync(lua_definitions_folder_path)) {
            fs.rmSync(lua_definitions_folder_path, {
                recursive: true,
                force: true,
            })
        }
        fs.mkdirSync(lua_definitions_folder_path, { recursive: true })
        const nodeDetails = getNodeDetails(filePath)

        const supported_models = fs
            .readdirSync(COMMAND_SETS)
            .filter((folder) =>
                fs.statSync(`${COMMAND_SETS}/${folder}`).isDirectory(),
            )

        for (const [model, nodes] of Object.entries(nodeDetails)) {
            if (!supported_models.includes(model.toUpperCase())) {
                void vscode.window.showInformationMessage(
                    `${model} model is not supported`,
                )
                return
            }

            const lib_base_path = join(COMMAND_SETS, model.toUpperCase())
            new_library_settings.push(join(lib_base_path, "Helper"))

            if (nodes.some((str) => str.includes("self"))) {
                new_library_settings.push(join(lib_base_path, "AllTspCommands"))
            }

            nodes.forEach((node) => {
                if (node.includes("node")) {
                    const node_num = parseInt(node.match(/\d+/)?.[0] || "", 10)
                    const node_cmd_file_path = join(
                        lib_base_path,
                        "tspLinkSupportedCommands",
                        "definitions.txt",
                    )
                    const node_cmd_file_content = fs
                        .readFileSync(node_cmd_file_path, "utf8")
                        .replace(/\$node_number\$/g, node_num.toString())
                    const new_node_cmd_file_path = join(
                        lua_definitions_folder_path,
                        `${model}_node${node_num}.lua`,
                    )
                    fs.writeFileSync(
                        new_node_cmd_file_path,
                        node_cmd_file_content,
                    )
                }
            })
        }

        // check if lua_definitions_folder_path is not empty

        if (fs.readdirSync(lua_definitions_folder_path).length !== 0) {
            new_library_settings.push(lua_definitions_folder_path)
        }
        await updateConfiguration(
            "Lua.workspace.library",
            new_library_settings,
            vscode.ConfigurationTarget.WorkspaceFolder,
            workspace_path,
            true,
        )
    }
}

async function pickConnection(connection_info?: string): Promise<void> {
    const options: vscode.QuickPickItem[] =
        InstrumentProvider.instance.getQuickPickOptions()

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
        const quickPick = vscode.window.createQuickPick()
        quickPick.items = options
        quickPick.title = "Connect to an Instrument"
        quickPick.placeholder =
            "Enter instrument IP address or VISA resource string"
        if (options.length > 0) {
            quickPick.placeholder =
                "Select connection from existing list or enter instrument IP address or VISA resource string"
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
    if (shouldPrompt) {
        const options: vscode.InputBoxOptions = {
            prompt: "Connect to instrument?",
            value: inIp,
        }
        Ip = await vscode.window.showInputBox(options)
    }
    if (Ip === undefined) {
        return
    }

    if (ConnectionHelper.parseConnectionString(Ip)) {
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

    const connection_str = def.addr

    if (ConnectionHelper.parseConnectionString(connection_str)) {
        Log.debug("Connection string is valid. Creating Terminal", LOGLOC)
        void createTerminal(def)
    } else {
        Log.error(
            `Connection string "${connection_str}" is invalid. Unable to connect to instrument.`,
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

    // eslint-disable-next-line @typescript-eslint/require-await
    async fetchConnDetails(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        term_pid: Thenable<number | undefined> | undefined,
    ): Promise<ConnectionDetails | undefined> {
        return undefined
        // if (_kicProcessMgr !== undefined) {
        //     const kicCell = _kicProcessMgr.kicList.find(
        //         (x) => x.terminalPid === term_pid,
        //     )
        //     const connDetails = kicCell?.connection
        //     kicCell?.sendTextToTerminal(".exit")
        //     let found = false
        //     await kicCell?.getTerminalState().then(
        //         () => {
        //             found = true
        //         },
        //         () => {
        //             found = false
        //         },
        //     )
        //     if (found) {
        //         return Promise.resolve(connDetails)
        //     }
        //     return Promise.reject(
        //         new Error(
        //             "Couldn't close terminal. Please check instrument state",
        //         ),
        //     )
        // }
    },

    async restartConnAfterDbg(name: string, connection: Connection) {
        await connection.connect(name)
    },
}
