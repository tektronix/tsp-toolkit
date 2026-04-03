import * as vscode from "vscode"

import { EXECUTABLE } from "./kic-cli"
import { Instrument } from "./instrument"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import {
    ConnectionDetails,
    ConnectionHelper,
    IoType,
    NO_OPEN_WORKSPACE_MESSAGE,
} from "./resourceManager"
import { configure_initial_workspace_configurations } from "./workspaceManager"
import { Log, SourceLocation } from "./logging"
import { InstrumentsExplorer } from "./instrumentExplorer"
import { Connection } from "./connection"
import { InstrumentProvider } from "./instrumentProvider"
import { ConfigWebView } from "./ConifgWebView"
import { activateTspDebug } from "./activateTspDebug"
import { ScriptGenWebViewManager } from "./scriptGenWebViewManager"
import { ScriptGenDataProvider } from "./scriptGenDataProvider"
import { TriggerFlowDataProvider } from "./triggerFlowDataProvider"
import { CombinedScriptGenDataProvider } from "./combinedScriptGenDataProvider"
import { TriggerFlowWebViewManager } from "./triggerFlowWebViewManager"
import { GenericSessionStorage } from "./genericSessionStorage"
import { isMacOS } from "./utility"
import {
    checkSystemDependencies,
    checkVisaInstallation,
    checkVisaInstallationLinux,
    isLinux,
    isWindows,
} from "./dependencyChecker"

let _instrExplorer: InstrumentsExplorer

/**
 * Function will create terminal with given connection details
 * @param connection_string connection string example 'tsPop@127.0.0.1'
 * @param model_serial model serial number
 * @param command_text command text that needs to send to terminal
 * @returns None
 */
/**
 * Creates or retrieves a connection to an instrument and initiates the terminal connection.
 * @param connection - Either a connection string (e.g., 'tsPop@127.0.0.1') or an existing Connection object
 * @returns Promise resolving to the Connection object, or undefined if connection fails
 */
export async function createTerminal(
    connection: Connection | string,
): Promise<Connection | undefined> {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "createTerminal()",
    }

    let conn: Connection
    let name = ""

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

        conn =
            existing ??
            new Connection(connection_details.type, connection_details.addr)
        name = connection_details.name
    } else {
        conn = connection
    }

    if (conn.type === IoType.Visa && isMacOS) {
        const errorMsg = "VISA connection is not supported on macOS."
        vscode.window.showErrorMessage(errorMsg)
        Log.error(`Connection failed: ${errorMsg}`, LOGLOC)
        return Promise.resolve(undefined)
    }

    // Check VISA availability if connecting via VISA protocol
    if (conn.type === IoType.Visa) {
        const ignoreMissingVisa = vscode.workspace
            .getConfiguration("tsp")
            .get<boolean>("ignoreMissingVisa", false)

        if (!ignoreMissingVisa) {
            let hasVisa = false
            if (isWindows) {
                hasVisa = await checkVisaInstallation()
            } else if (isLinux) {
                hasVisa = await checkVisaInstallationLinux()
            } else {
                // macOS or other platforms - assume VISA not available
                hasVisa = false
            }

            if (!hasVisa) {
                Log.error(
                    "VISA not installed but required for this connection",
                    LOGLOC,
                )
                await vscode.window
                    .showErrorMessage(
                        "VISA is not installed on your system. Please install VISA to use this connection method, or use raw sockets to connect instead.",
                        "Download VISA",
                        "Close",
                    )
                    .then((selection) => {
                        if (selection === "Download VISA") {
                            vscode.env.openExternal(
                                vscode.Uri.parse(
                                    "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
                                ),
                            )
                        }
                    })
                return
            }
        }
    }

    if (await conn.connect(name)) {
        return conn
    }
    return Promise.resolve(undefined)
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

/**
 * Check if the extension version has changed and show an announcement for new features
 * @param context - Extension context for accessing globalState
 */
async function checkVersionAndShowAnnouncement(
    context: vscode.ExtensionContext,
) {
    const LOGLOC: SourceLocation = {
        file: "extension.ts",
        func: "checkVersionAndShowAnnouncement()",
    }

    const currentVersion = (
        vscode.extensions.getExtension("Tektronix.tsp-toolkit")?.packageJSON as
            | { version?: string }
            | undefined
    )?.version
    const previousVersion = context.globalState.get<string>(
        "tsp-toolkit-version",
    )

    // First install or version changed
    if (previousVersion !== currentVersion) {
        Log.debug(
            `Version changed from ${previousVersion} to ${currentVersion}`,
            LOGLOC,
        )

        // Update stored version
        await context.globalState.update("tsp-toolkit-version", currentVersion)

        let message = ""
        message = `TSP Toolkit v${currentVersion} has been successfully installed. Check out the features!`

        if (previousVersion && currentVersion) {
            message = `TSP Toolkit just upgraded to v${currentVersion}. Check out what's new!`
        }
        const changelogPath = vscode.Uri.joinPath(
            context.extensionUri,
            "CHANGELOG.md",
        )

        const action = await vscode.window.showInformationMessage(
            message,
            "View Changelog",
            "Dismiss",
        )

        if (action === "View Changelog") {
            // Open CHANGELOG.md file in preview mode
            await vscode.commands.executeCommand(
                "markdown.showPreview",
                changelogPath,
            )
        }
    }
}

// Called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    const LOGLOC: SourceLocation = { file: "extension.ts", func: "activate()" }
    Log.info("TSP Toolkit activating", LOGLOC)

    // Check for version updates and show announcement
    Log.debug("Checking for version updates", LOGLOC)
    void checkVersionAndShowAnnouncement(context)

    Log.debug("Updating extension settings", LOGLOC)
    updateExtensionSettings()

    // Check for system dependencies
    Log.debug("Checking system dependencies", LOGLOC)
    void checkSystemDependencies()

    Log.debug("Creating new InstrumentExplorer", LOGLOC)
    _instrExplorer = new InstrumentsExplorer(context)

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    registerCommands(context, [
        { name: "tsp.openTerminal", cb: pickConnection },
        { name: "tsp.openTerminalIP", cb: createTerminal },
        {
            name: "InstrumentsExplorer.connect",
            cb: async () => {
                await pickConnection()
            },
        },
        {
            name: "tsp.saveTspOutputStart",
            cb: async (instr: Instrument) => {
                await instr.startSaveTspOutput()
            },
        },
        {
            name: "tsp.saveTspOutputEnd",
            cb: (instr: Instrument) => {
                instr.stopSaveTspOutput()
            },
        },
        {
            name: "tsp.saveBuffersToFile",
            cb: async (instr: Instrument) => {
                //TODO: Implement
                await instr.saveBufferContents()
            },
        },
        {
            name: "tsp.saveScriptOutput",
            cb: async (e: vscode.Uri) => {
                //TODO: Implement
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
                        const output = await vscode.window.showSaveDialog({
                            title: "Select Output File",
                        })
                        if (!output) {
                            return
                        }
                        await connection.saveScriptOutput(
                            e.fsPath,
                            output.fsPath,
                        )
                    }
                } else {
                    const conn = await pickConnection()
                    if (!conn) {
                        return
                    }
                    const output = await vscode.window.showSaveDialog({
                        title: "Select Output File",
                    })
                    if (!output) {
                        return
                    }
                    await conn?.saveScriptOutput(e.fsPath, output.fsPath)
                }
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
            name: "InstrumentsExplorer.abort",
            cb: async (e: Connection) => {
                await startAbort(e)
                vscode.window.showInformationMessage("Abort complete")
            },
        },
        {
            name: "InstrumentsExplorer.upgradeFirmware",
            cb: async (e: Instrument) => {
                await e.upgrade()
            },
        },
        // {
        //     name: "tsp.sendFileToAllInstr",
        //     cb: async (e: vscode.Uri) => {
        //         await InstrumentProvider.instance.sendToAllActiveTerminals(
        //             e.fsPath,
        //         )
        //     },
        // },
        {
            name: "tsp.sendFile",
            cb: async (e: vscode.Uri) => {
                // If no file URI is provided (e.g., from command palette), use active editor
                if (!e) {
                    const activeEditor = vscode.window.activeTextEditor
                    if (
                        activeEditor &&
                        (activeEditor.document.uri.fsPath.endsWith(".tsp") ||
                            activeEditor.document.uri.fsPath.endsWith(".tspa"))
                    ) {
                        e = activeEditor.document.uri
                    } else {
                        vscode.window.showErrorMessage(
                            "No file selected. Please open a TSP file.",
                        )
                        return
                    }
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
                        connection.sendScript(e.fsPath)
                    }
                } else {
                    const conn = await pickConnection()
                    conn?.sendScript(e.fsPath)
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
                        connection.getNodes(
                            vscode.workspace.workspaceFolders[0].uri.fsPath,
                        )
                    }
                } else {
                    const conn = await pickConnection()
                    conn?.getNodes(
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
    void systemConfigWebViewprovider.deprecateOldSystemConfigurations()

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

    activateTspDebug(context)

    // Script Generation and Trigger Flow setup with combined tree view
    const scriptGenStorage = new GenericSessionStorage("I-V Characterization")
    const scriptGenDataProvider = new ScriptGenDataProvider(scriptGenStorage)

    const triggerFlowStorage = new GenericSessionStorage("Trigger Flow")
    const triggerFlowDataProvider = new TriggerFlowDataProvider(
        triggerFlowStorage,
    )

    // Create combined provider that shows both in one tree view
    const combinedProvider = new CombinedScriptGenDataProvider(
        scriptGenDataProvider,
        triggerFlowDataProvider,
    )

    const treeView = vscode.window.createTreeView("ToolsView", {
        treeDataProvider: combinedProvider,
    })

    scriptGenDataProvider.setTreeView(treeView)
    triggerFlowDataProvider.setTreeView(treeView)

    // Managers use their specific data providers
    new ScriptGenWebViewManager(context, scriptGenDataProvider)
    new TriggerFlowWebViewManager(context, triggerFlowDataProvider)

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

//Request the instrument to be reset
function startAbort(def: Connection): Promise<void> {
    return Promise.resolve(def.abort())
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

export async function pickConnection(): Promise<Connection | undefined> {
    const options: vscode.QuickPickItem[] =
        InstrumentProvider.instance.getQuickPickOptions()
    {
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
                    const connection = await createTerminal(selectedItem.label)
                    if (connection) {
                        resolve(connection)
                    } else {
                        resolve(undefined)
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Error: ${(error as Error).message}`,
                    )
                    resolve(undefined)
                } finally {
                    quickPick.busy = false
                    quickPick.dispose()
                }
            })

            quickPick.show()
        })
    }
}

export function getActiveConnection(): Promise<Connection | undefined> {
    const term = vscode.window.activeTerminal
    if (
        (term?.creationOptions as vscode.TerminalOptions)?.shellPath ===
        EXECUTABLE
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
            return Promise.resolve(connection)
        }
    }

    return Promise.resolve(undefined)
}

//function startTerminateAllConn() {
//    void _terminationMgr.terminateAllConn()
//}

async function startRename(def: Instrument): Promise<void> {
    await _instrExplorer.rename(def)
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
