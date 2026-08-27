import * as vscode from "vscode"

import { ProgressLocation } from "vscode"
import { EXECUTABLE } from "./kic-cli"
import { Instrument } from "./instrument"
import { HelpDocumentWebView } from "./helpDocumentWebView"
import {
    ConnectionDetails,
    ConnectionHelper,
    InstrInfo,
    IoType,
    NO_OPEN_WORKSPACE_MESSAGE,
} from "./resourceManager"
import { configure_initial_workspace_configurations } from "./workspaceManager"
import { Log, SourceLocation } from "./logging"
import { InstrumentsExplorer } from "./instrumentExplorer"
import { Connection, ConnectionStatus } from "./connection"
import { InstrumentProvider } from "./instrumentProvider"
import { ConfigWebView } from "./ConifgWebView"
import { activateTspDebug } from "./activateTspDebug"
import { ScriptGenWebViewManager } from "./scriptGenWebViewManager"
import { ScriptGenDataProvider } from "./scriptGenDataProvider"
import { TriggerFlowDataProvider } from "./triggerFlowDataProvider"
import { CombinedScriptGenDataProvider } from "./combinedScriptGenDataProvider"
import { TriggerFlowWebViewManager } from "./triggerFlowWebViewManager"
import { GenericSessionStorage } from "./genericSessionStorage"
import { extractTarGzToDisk, isMacOS } from "./utility"
import { convertTspToPython } from "./tspConverter"
import {
    checkSystemDependencies,
    checkVisaInstallation,
    checkVisaInstallationLinux,
    isLinux,
    isWindows,
} from "./dependencyChecker"
import { ExtraActionsWebView } from "./ExtraActionsWebView"

let _instrExplorer: InstrumentsExplorer
let _tspConverterDiagnostics: vscode.DiagnosticCollection

/**
 * Represents a contributed TSP Toolkit configuration setting.
 */
interface ResettableSetting {
    key: string
    label: string
    description?: string
}

/**
 * Represents one reset option shown to the user.
 */
interface ResetAction {
    id: string
    label: string
    description: string
    detail?: string
    preview(): ResetActionPreview | Promise<ResetActionPreview>
    execute(): Promise<void>
}

interface ResetActionPreview {
    shouldExecute: boolean
    skipReason?: string
    warningNote?: string
}

interface ManifestConfigurationSection {
    properties?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function getManifestConfigurationSections(
    packageJson: unknown,
): ManifestConfigurationSection[] {
    if (!isRecord(packageJson)) {
        return []
    }

    const contributes = packageJson["contributes"]
    if (!isRecord(contributes)) {
        return []
    }

    const configuration = contributes["configuration"]
    if (Array.isArray(configuration)) {
        return configuration.filter(isRecord)
    }

    if (isRecord(configuration)) {
        return [configuration]
    }

    return []
}

const RESET_LABELS: Record<string, string> = {
    "tsp.savedInstruments": "Saved Instruments",
    "tsp.tspLinkSystemConfigurations": "Saved System Configurations",
    "tsp.lineFrequency": "Power Line Frequency",
    "tsp.ignoreMissingVisa": "Ignore Missing VISA Warning",
    "tsp.showFunction": "Show Functions in Variables Pane",
    "tsp.reset": "Reset Instrument on Connection",
    "tsp.clearErrorQueue": "Clear Error Queue on Connection",
}

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

    return vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${typeof connection === "string" ? connection : connection.addr}`,
        },
        async (progress, token) => {
            progress.report({
                message: `Preparing connection to ${typeof connection === "string" ? connection : connection.addr}`,
            })

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
                    InstrumentProvider.instance.getConnection(
                        connection_details,
                    )

                conn =
                    existing ??
                    new Connection(
                        connection_details.type,
                        connection_details.addr,
                    )
                name = connection_details.name
            } else {
                conn = connection
            }

            if (token.isCancellationRequested) {
                return Promise.resolve(undefined)
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
                    progress.report({
                        message: `Checking VISA prerequisites for ${typeof connection === "string" ? connection : connection.addr}`,
                    })

                    let hasVisa = false
                    if (isWindows) {
                        hasVisa = await checkVisaInstallation()
                    } else if (isLinux) {
                        hasVisa = await checkVisaInstallationLinux()
                    } else {
                        // macOS or other platforms - assume VISA not available
                        hasVisa = false
                    }

                    // We are checking before VISA, checking VISA installation may take some time
                    // if cancellation happened during that time, we should return early
                    if (token.isCancellationRequested) {
                        return undefined
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

            if (
                await conn.connect(name, {
                    progress,
                    token,
                })
            ) {
                return conn
            }
            return Promise.resolve(undefined)
        },
    )
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
            message = `TSP Toolkit just updated to v${currentVersion}. Check out what's new!`
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
export async function activate(context: vscode.ExtensionContext) {
    const LOGLOC: SourceLocation = { file: "extension.ts", func: "activate()" }
    Log.info("TSP Toolkit activating", LOGLOC)

    // Diagnostic collection for TSP → Python conversion warnings/errors
    _tspConverterDiagnostics =
        vscode.languages.createDiagnosticCollection("tsp-converter")
    context.subscriptions.push(_tspConverterDiagnostics)

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
            name: "InstrumentsExplorer.updateFirmware",
            cb: async (e: Instrument) => {
                await e.update()
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
        {
            name: "tsp.resetToDefaults",
            cb: async () => {
                await resetToolkitDefaults()
            },
        },
        {
            name: "tsp.convertToPython",
            cb: async (e: vscode.Uri) => {
                await convertTspToPython(e, _tspConverterDiagnostics)
            },
        },
        {
            name: "tsp.fetchExampleScripts",
            cb: async (uri: vscode.Uri | undefined) => {
                await vscode.window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                    },
                    async (progress) => {
                        progress.report({ message: "Fetching script examples" })
                        console.error("Fetching example scripts")
                        if (!uri) {
                            const user_uri = await vscode.window.showOpenDialog(
                                {
                                    title: "Select Folder to Save Example Scripts",
                                    openLabel: "Save",
                                    canSelectFiles: false,
                                    canSelectFolders: true,
                                    canSelectMany: false,
                                },
                            )
                            if (user_uri) {
                                // The user can only select 1 based on the options above
                                uri = user_uri[0]
                            } else {
                                return
                            }
                        }

                        const resp = await fetch(
                            "https://github.com/tektronix/keithley/archive/refs/heads/main.tar.gz",
                            {
                                method: "GET",
                                mode: "cors",
                            },
                        )
                        if (!resp.ok) {
                            console.error("Unable to fetch example scripts")
                            return
                        }
                        const buffer = await resp.arrayBuffer()
                        progress.report({
                            message: `Extracting example scripts to ${uri.fsPath}`,
                        })
                        await extractTarGzToDisk(buffer, uri.fsPath)
                    },
                )
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

    const extraActionsWebViewProvider = new ExtraActionsWebView(
        context.extensionUri,
    )
    const extraActionsViewDisposable =
        vscode.window.registerWebviewViewProvider(
            ExtraActionsWebView.viewType,
            extraActionsWebViewProvider,
        )

    context.subscriptions.push(extraActionsViewDisposable)

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

    await GenericSessionStorage.migrateLegacySessions()

    // Script Generation and Trigger Flow setup with combined tree view
    const scriptGenStorage = new GenericSessionStorage(
        "I-V Characterization",
        "scriptGenSessions",
    )
    const scriptGenDataProvider = new ScriptGenDataProvider(scriptGenStorage)

    const triggerFlowStorage = new GenericSessionStorage(
        "Trigger Flow",
        "triggerFlowSessions",
    )
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

function collectResettableSettings(): ResettableSetting[] {
    const extension = vscode.extensions.getExtension("Tektronix.tsp-toolkit")

    const configs = getManifestConfigurationSections(extension?.packageJSON)

    if (configs.length === 0) {
        return []
    }

    const settings: ResettableSetting[] = []

    for (const config of configs) {
        const properties = config.properties ?? {}

        for (const [key, value] of Object.entries(properties)) {
            if (!key.startsWith("tsp.")) {
                continue
            }

            const property = value as {
                description?: string
                markdownDescription?: string
            }

            settings.push({
                key,
                label: RESET_LABELS[key] ?? key,
                description:
                    property.description ?? property.markdownDescription,
            })
        }
    }

    return settings
}

async function resetConfigurationKey(key: string): Promise<boolean> {
    const configuration = vscode.workspace.getConfiguration()

    const inspect = configuration.inspect(key)

    if (!inspect) {
        return false
    }

    let updated = false

    if (inspect.globalValue !== undefined) {
        await configuration.update(
            key,
            undefined,
            vscode.ConfigurationTarget.Global,
        )
        updated = true
    }

    if (inspect.workspaceValue !== undefined) {
        await configuration.update(
            key,
            undefined,
            vscode.ConfigurationTarget.Workspace,
        )
        updated = true
    }

    if (inspect.workspaceFolderValue !== undefined) {
        await configuration.update(
            key,
            undefined,
            vscode.ConfigurationTarget.WorkspaceFolder,
        )
        updated = true
    }

    return updated
}

//Reset multiple settings to their default values
async function resetSettings(settings: ResettableSetting[]): Promise<void> {
    for (const setting of settings) {
        await resetConfigurationKey(setting.key)
    }
}

function hasConfiguredValue(key: string): boolean {
    const inspect = vscode.workspace.getConfiguration().inspect(key)
    return Boolean(
        inspect &&
            (inspect.globalValue !== undefined ||
                inspect.workspaceValue !== undefined ||
                inspect.workspaceFolderValue !== undefined),
    )
}

// Return the serial numbers of saved instruments that have at least one connected terminal
function getConnectedSavedSerialNumbers(): Set<string> {
    const connected = new Set<string>()
    for (const instrument of InstrumentProvider.instance.instruments) {
        if (!instrument.saved) {
            continue
        }
        const hasActiveTerminal = instrument.connections.some(
            (c) => c.status === ConnectionStatus.Connected,
        )
        if (hasActiveTerminal) {
            connected.add(instrument.info.serial_number)
        }
    }
    return connected
}

// Delete saved instruments that have no active terminal connection; keep those that do
async function resetSavedInstrumentsPreservingActiveConnections(): Promise<void> {
    const config = vscode.workspace.getConfiguration("tsp")
    const saved = config.get<InstrInfo[]>("savedInstruments") ?? []
    const connectedSerials = getConnectedSavedSerialNumbers()

    const kept = saved.filter((instr) =>
        connectedSerials.has(instr.serial_number),
    )

    await config.update(
        "savedInstruments",
        kept,
        vscode.ConfigurationTarget.Global,
    )
}

//Build a list of reset actions for the user to choose from
function buildResetActions(): ResetAction[] {
    const settings = collectResettableSettings()

    const systemConfigurations = settings.filter(
        (s) => s.key === "tsp.tspLinkSystemConfigurations",
    )

    const otherSettings = settings.filter(
        (s) =>
            s.key !== "tsp.savedInstruments" &&
            s.key !== "tsp.tspLinkSystemConfigurations" &&
            s.key !== "tsp.script_generation" &&
            s.key !== "tsp.scriptGenSessions" &&
            s.key !== "tsp.triggerFlowSessions",
    )

    return [
        {
            id: "savedInstruments",
            label: "Saved Instruments",
            description:
                "Delete saved instruments; instruments with active connections are kept",
            preview: (): ResetActionPreview => {
                const config = vscode.workspace.getConfiguration("tsp")
                const saved = config.get<InstrInfo[]>("savedInstruments") ?? []

                if (saved.length === 0) {
                    return {
                        shouldExecute: false,
                        skipReason: "No saved instruments found.",
                    }
                }

                const connectedSerials = getConnectedSavedSerialNumbers()
                const removable = saved.filter(
                    (instr) => !connectedSerials.has(instr.serial_number),
                )

                if (removable.length === 0) {
                    return {
                        shouldExecute: false,
                        skipReason:
                            "Only active saved instruments exist and are preserved.",
                    }
                }

                return { shouldExecute: true }
            },
            execute: async (): Promise<void> => {
                await resetSavedInstrumentsPreservingActiveConnections()
            },
        },

        {
            id: "systemConfigurations",
            label: "Saved System Configurations",
            description: "Reset saved system configurations",
            preview: (): ResetActionPreview => {
                const systems =
                    vscode.workspace
                        .getConfiguration("tsp")
                        .get<unknown[]>("tspLinkSystemConfigurations") ?? []

                if (systems.length === 0) {
                    return {
                        shouldExecute: false,
                        skipReason: "No saved system configurations found.",
                    }
                }

                return { shouldExecute: true }
            },
            execute: async (): Promise<void> => {
                await resetSettings(systemConfigurations)
            },
        },

        {
            id: "preferences",
            label: "Other TSP Toolkit Preferences",
            description: "Reset remaining extension settings",
            detail: otherSettings.map((s) => s.label).join(", "),
            preview: (): ResetActionPreview => {
                const configuredSettings = otherSettings.filter((setting) =>
                    hasConfiguredValue(setting.key),
                )

                if (configuredSettings.length === 0) {
                    return {
                        shouldExecute: false,
                        skipReason:
                            "All selected preferences are already at defaults.",
                    }
                }

                return { shouldExecute: true }
            },
            execute: async (): Promise<void> => {
                await resetSettings(otherSettings)
            },
        },

        {
            id: "scriptGen",
            label: "Delete Script Generation Sessions",
            description: "Delete all Script Generation sessions",
            preview: (): ResetActionPreview => {
                const storage = new GenericSessionStorage(
                    "I-V Characterization",
                    "scriptGenSessions",
                )
                if (storage.getSessionCount() === 0) {
                    return {
                        shouldExecute: false,
                        skipReason: "No Script Generation sessions found.",
                    }
                }

                return {
                    shouldExecute: true,
                    warningNote:
                        "Note: Active and saved sessions will be deleted.",
                }
            },
            execute: async (): Promise<void> => {
                await vscode.commands.executeCommand(
                    "tsp.deleteAllScriptGenSessions",
                )
            },
        },

        {
            id: "triggerFlow",
            label: "Delete TriggerFlow Sessions",
            description: "Delete all TriggerFlow sessions",
            preview: (): ResetActionPreview => {
                const storage = new GenericSessionStorage(
                    "Trigger Flow",
                    "triggerFlowSessions",
                )
                if (storage.getSessionCount() === 0) {
                    return {
                        shouldExecute: false,
                        skipReason: "No TriggerFlow sessions found.",
                    }
                }

                return {
                    shouldExecute: true,
                    warningNote:
                        "Note: Active and saved sessions will be deleted.",
                }
            },
            execute: async (): Promise<void> => {
                await vscode.commands.executeCommand(
                    "tsp.deleteAllTriggerFlowSessions",
                )
            },
        },
    ]
}

async function resetToolkitDefaults() {
    const actions = buildResetActions()

    const picks = actions.map((action) => ({
        label: action.label,
        description: action.description,
        detail: action.detail,
        action,
    }))

    const selected = await vscode.window.showQuickPick(picks, {
        title: "Reset to Defaults",
        canPickMany: true,
    })

    if (!selected || selected.length === 0) {
        return
    }

    const previewResults = await Promise.all(
        selected.map(async (item) => ({
            item,
            preview: await item.action.preview(),
        })),
    )

    const executableItems = previewResults.filter(
        (r) => r.preview.shouldExecute,
    )

    // if (executableItems.length === 0) {
    //     await vscode.window.showInformationMessage("Nothing to reset.")
    //     return
    // }

    const resetSummary = previewResults
        .map((result, index) => {
            const warningLine = result.preview.warningNote
                ? `\n    - ${result.preview.warningNote}`
                : ""
            return `${index + 1}. ${result.item.label}${warningLine}`
        })
        .join("\n")

    const confirmation = await vscode.window.showWarningMessage(
        `The following items will be reset:\n\n${resetSummary}\n\nThis action cannot be undone.`,
        {
            modal: true,
            detail: "Do you want to continue?",
        },
        "Reset",
    )

    if (confirmation !== "Reset") {
        return
    }

    for (const result of executableItems) {
        await result.item.action.execute()
    }

    vscode.window.showInformationMessage("Reset completed successfully.")
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
