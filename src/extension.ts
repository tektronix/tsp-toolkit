import * as vscode from "vscode"

import { EXECUTABLE } from "./kic-cli"
import { Instrument } from "./instrument"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import {
    ConnectionDetails,
    ConnectionHelper,
    NO_OPEN_WORKSPACE_MESSAGE,
} from "./resourceManager"
import { configure_initial_workspace_configurations } from "./workspaceManager"
import { Log, SourceLocation } from "./logging"
import { InstrumentsExplorer } from "./instrumentExplorer"
import { Connection } from "./connection"
import { InstrumentProvider } from "./instrumentProvider"
import { ConfigWebView } from "./ConifgWebView"

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
): Promise<Connection | undefined> {
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
    return Promise.resolve(conn)
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
                vscode.window.showInformationMessage("Reset complete")
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
            cb: async (e: vscode.Uri) => {
                await InstrumentProvider.instance.sendToAllActiveTerminals(
                    e.fsPath,
                )
            },
        },
        {
            name: "tsp.sendFile",
            cb: async (e: vscode.Uri) => {
                const term = vscode.window.activeTerminal
                if (
                    (term?.creationOptions as vscode.TerminalOptions)
                        ?.shellPath === EXECUTABLE
                ) {
                    let connection: Connection | undefined = undefined
                    for (const i of InstrumentProvider.instance.instruments) {
                        connection = i.connections.find(
                            (c) => c.terminal?.processId === term?.processId,
                        )
                        if (connection) {
                            break
                        }
                    }

                    if (connection) {
                        await connection.sendScript(e.fsPath)
                    }
                } else {
                    const conn = await pickConnection()
                    await conn?.sendScript(e.fsPath)
                }
            },
        },
        {
            name: "systemConfigurations.fetchConnectionNodes",
            cb: async () => {
                if (!vscode.workspace.workspaceFolders) {
                    vscode.window.showInformationMessage(
                        `${NO_OPEN_WORKSPACE_MESSAGE}`,
                    )
                    return
                }

                const term = vscode.window.activeTerminal
                if (
                    (term?.creationOptions as vscode.TerminalOptions)
                        ?.shellPath === EXECUTABLE
                ) {
                    let connection: Connection | undefined = undefined
                    for (const i of InstrumentProvider.instance.instruments) {
                        connection = i.connections.find(
                            (c) => c.terminal?.processId === term?.processId,
                        )
                        if (connection) {
                            break
                        }
                    }

                    if (connection) {
                        await connection.getNodes(
                            vscode.workspace.workspaceFolders[0].uri.fsPath,
                        )
                    }
                } else {
                    const conn = await pickConnection()
                    await conn?.getNodes(
                        vscode.workspace.workspaceFolders[0].uri.fsPath,
                    )
                }
            },
        },
    ])

    Log.debug("Setting up HelpDocumentWebView", LOGLOC)
    HelpDocumentWebView.createOrShow(context)
    // Instantiate a new instance of the ViewProvider class
    const systemConfigWebViewprovider = new ConfigWebView(context.extensionUri)

    registerCommand(
        context,
        "systemConfigurations.addSystem",
        systemConfigWebViewprovider.addSystem.bind(systemConfigWebViewprovider),
    )

    // Register the provider for a Webview View
    const systemConfigViewDisposable =
        vscode.window.registerWebviewViewProvider(
            ConfigWebView.viewType,
            systemConfigWebViewprovider,
        )
    context.subscriptions.push(systemConfigViewDisposable)

    Log.debug(
        "Checking to see if workspace folder contains `*.tsp` files",
        LOGLOC,
    )

    Log.debug("Update local and global configuration for TSP", LOGLOC)
    void configure_initial_workspace_configurations()
    Log.debug(
        "Subscribing to TSP configuration changes in all workspace folders",
        LOGLOC,
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

async function pickConnection(
    connection_info?: string,
): Promise<Connection | undefined> {
    const options: vscode.QuickPickItem[] =
        InstrumentProvider.instance.getQuickPickOptions()

    if (connection_info !== undefined) {
        const options: vscode.InputBoxOptions = {
            prompt: "Enter instrument IP address or VISA resource string",
            validateInput: ConnectionHelper.instrConnectionStringValidator,
        }
        const address = await vscode.window.showInputBox(options)
        if (address === undefined) {
            return
        }
        await connect(address)
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

        return new Promise<Connection | undefined>((resolve) => {
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
                        resolve(await createTerminal(selectedItem.label))
                    } else {
                        const Ip = selectedItem.label
                        if (Ip === undefined) {
                            return
                        }
                        resolve(await connect(Ip))
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
        })
    }
}

async function connect(
    inIp: string,
    shouldPrompt?: boolean,
): Promise<Connection | undefined> {
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
        return await createTerminal(Ip)
    } else {
        void vscode.window.showErrorMessage("Bad connection string")
    }
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
                (t.creationOptions as vscode.TerminalOptions)?.shellPath ===
                EXECUTABLE,
        )
        return kicTerminals
    },

    async fetchConnDetails(
        term_pid: Thenable<number | undefined> | undefined,
    ): Promise<ConnectionDetails | undefined> {
        const pid = await term_pid
        if (pid) {
            const connection =
                await InstrumentProvider.instance.getTerminalByPid(pid)
            if (connection) {
                return {
                    name: connection.terminal?.name ?? "",
                    addr: connection.addr,
                    type: connection.type,
                }
            }
        }
        return undefined
    },

    async restartConnAfterDbg(details: ConnectionDetails) {
        const conn = InstrumentProvider.instance.getConnection(details)
        await conn?.connect(details.name)
    },
}
