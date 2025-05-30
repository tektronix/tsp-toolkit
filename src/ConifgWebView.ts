import { join } from "node:path"
import * as vscode from "vscode"
import { Uri, Webview, WebviewView, WebviewViewProvider } from "vscode"
import {
    NO_OPEN_WORKSPACE_MESSAGE,
    Node,
    SUPPORTED_MODELS_DETAILS,
    SystemInfo,
} from "./resourceManager"
import { updateLuaLibraryConfigurations } from "./workspaceManager"

export class ConfigWebView implements WebviewViewProvider {
    public static readonly viewType = "systemConfigurations"
    private _webviewView!: vscode.WebviewView
    constructor(private readonly _extensionUri: Uri) {
        // Register a callback for configuration changes
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("tsp.tspLinkSystemConfigurations")) {
                await this.getSystemName()
                await updateLuaLibraryConfigurations()
            }
        })
    }
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.WebviewViewResolveContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken,
    ) {
        this._webviewView = webviewView
        // Allow scripts in the webview
        webviewView.webview.options = {
            // Enable JavaScript in the webview
            enableScripts: true,
            // Restrict the webview to only load resources from the `out` directory
            localResourceRoots: [Uri.joinPath(this._extensionUri)],
        }

        // Set the HTML content that will fill the webview view
        webviewView.webview.html = this._getWebviewContent(webviewView.webview)

        // Sets up an event listener to listen for messages passed from the webview view context
        // and executes code based on the message that is recieved
        this._setWebviewMessageListener(webviewView)
    }
    private _getWebviewContent(webview: Webview) {
        const webviewScriptUri = this.getUri(webview, this._extensionUri, [
            "out",
            "systemConfig.js",
        ])
        const stylesUri = this.getUri(webview, this._extensionUri, [
            "out",
            "styles.css",
        ])
        const codiconsUri = this.getUri(webview, this._extensionUri, [
            "node_modules",
            "@vscode/codicons",
            "dist",
            "codicon.css",
        ])
        const nonce = this.getNonce()
        return /*html*/ `
            <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<link rel="stylesheet" href="${stylesUri.toString()}">
<link rel="stylesheet" href="${codiconsUri.toString()}">
  <title>System Configuration</title>
</head>

<body>
  <div id="systems-container"></div>
  <script type="module" nonce="${nonce}" src="${webviewScriptUri.toString()}"></script>
  </div>
</body>
</html>
`
    }

    public async deprecateOldSystemConfigurations() {
        if (vscode.workspace.workspaceFolders) {
            const configFilePath = join(
                vscode.workspace.workspaceFolders[0].uri.fsPath,
                ".vscode/tspConfig/config.tsp.json",
            )
            if (
                await vscode.workspace.fs
                    .stat(vscode.Uri.file(configFilePath))
                    .then(
                        () => true,
                        () => false,
                    )
            ) {
                // if configurations is present
                const systemInfo =
                    await this.getOldConfiguration(configFilePath)
                if (systemInfo) {
                    const option = await vscode.window.showWarningMessage(
                        "An old system configuration was found. Do you want to export it to the new structure and delete the old configuration file and folder?",
                        "Yes",
                        "No",
                    )

                    if (option === "Yes") {
                        const nodes: Node[] = []
                        for (const key in systemInfo) {
                            if (key.includes("node")) {
                                nodes.push({
                                    nodeId: key,
                                    mainframe: systemInfo[key],
                                })
                            }
                        }
                        const name = await this.getNewSystemName()
                        if (!name) {
                            vscode.window.showWarningMessage(
                                "Unable to get the new system name",
                            )
                            return
                        }

                        const newItem: SystemInfo = {
                            name: name,
                            localNode: systemInfo.self,
                            isActive: false,
                            nodes: nodes,
                        }

                        const originalSystemInfo: SystemInfo[] =
                            vscode.workspace
                                .getConfiguration("tsp")
                                .get("tspLinkSystemConfigurations") ?? []

                        const updatedSystemInfos = [
                            ...originalSystemInfo,
                            newItem,
                        ]

                        await vscode.workspace
                            .getConfiguration("tsp")
                            .update(
                                "tspLinkSystemConfigurations",
                                updatedSystemInfos,
                                false,
                            )
                        await this.activateSystem(name)
                        vscode.commands.executeCommand(
                            "systemConfigurations.focus",
                        )
                        const configFolder = join(
                            vscode.workspace.workspaceFolders[0].uri.fsPath,
                            ".vscode/tspConfig/",
                        )
                        await this.deleteOldSystemConfigurations(configFolder)
                    }
                }
            }
        }
    }

    private async getOldConfiguration(
        configFilePath: string,
    ): Promise<{ [key: string]: string } | null> {
        try {
            const fileUri = vscode.Uri.file(configFilePath)
            const fileData = await vscode.workspace.fs.readFile(fileUri)
            const jsonStr = Buffer.from(fileData).toString("utf8")
            interface OldConfig {
                nodes?: { [key: string]: { model?: string } }
                self?: string
                [key: string]: unknown
            }

            const config = JSON.parse(jsonStr) as OldConfig

            const result: { [key: string]: string } = {}
            if (
                config.self &&
                config.self.trim() !== "" &&
                typeof config.nodes === "object"
            ) {
                result["self"] = config.self
                for (const nodeKey of Object.keys(config.nodes)) {
                    const node = config.nodes[nodeKey]
                    if (node && typeof node.model === "string") {
                        const nodeNumber = nodeKey.match(/\d+/)?.[0] ?? nodeKey
                        const nodeId = `node[${nodeNumber}]`
                        if (
                            Object.prototype.hasOwnProperty.call(result, nodeId)
                        ) {
                            return null
                        }
                        result[nodeId] = node.model
                    }
                }
                //check if model in configuration are in supported model list
                const supportedModels = Object.keys(SUPPORTED_MODELS_DETAILS)
                for (const key in result) {
                    const model = result[key]
                    if (!supportedModels.includes(model)) {
                        return null
                    }
                }
                return result
            }
            return null
        } catch {
            return null
        }
    }

    private async deleteOldSystemConfigurations(folderPath: string) {
        // delete this folder
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(folderPath), {
                recursive: true,
                useTrash: false,
            })
        } catch (error) {
            vscode.window.showWarningMessage(
                "Failed to delete old configuration folder: " +
                    (error instanceof Error ? error.message : String(error)),
            )
        }
    }

    public addSystem() {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage(`${NO_OPEN_WORKSPACE_MESSAGE}`)
            return
        }
        const savedSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []
        this._webviewView.webview.postMessage({
            command: "supportedModels",
            payload: JSON.stringify({
                systemInfo: savedSystems,
                supportedModels: SUPPORTED_MODELS_DETAILS,
            }),
        })
    }

    private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            switch (message.command) {
                case "openFolder": {
                    const uri = await vscode.window.showOpenDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                        canSelectMany: true,
                        openLabel: "Open Folder",
                    })
                    if (uri && uri.length > 0) {
                        vscode.commands.executeCommand(
                            "vscode.openFolder",
                            uri[0],
                        )
                    }
                    break
                }
                case "getInitialSystems": {
                    if (!vscode.workspace.workspaceFolders) {
                        webviewView.webview.postMessage({
                            command: "openWorkspaceNotFound",
                        })
                        break
                    }

                    this.reloadUi(webviewView)
                    break
                }
                case "add": {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const newSystemDetails = message.data as SystemInfo
                    const originalSystemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    const newItem: SystemInfo = {
                        name: newSystemDetails.name,
                        localNode: newSystemDetails.localNode,
                        isActive: newSystemDetails.isActive,
                        slots: newSystemDetails.slots,
                        nodes: newSystemDetails.nodes,
                    }

                    const updatedSystemInfos = [...originalSystemInfo, newItem]

                    await vscode.workspace
                        .getConfiguration("tsp")
                        .update(
                            "tspLinkSystemConfigurations",
                            updatedSystemInfos,
                            false,
                        )
                    const systemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    webviewView.webview.postMessage({
                        command: "systems",
                        payload: JSON.stringify({
                            systemInfo: systemInfo,
                            supportedModels: SUPPORTED_MODELS_DETAILS,
                            selectedSystem: newSystemDetails.name,
                        }),
                    })
                    await this.activateSystem(newSystemDetails.name)
                    break
                }
                case "delete": {
                    const originalSystemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    const item = message.data
                    const updatedSystemInfos = originalSystemInfo.filter(
                        (sys) => sys.name !== item,
                    )
                    await vscode.workspace
                        .getConfiguration("tsp")
                        .update(
                            "tspLinkSystemConfigurations",
                            updatedSystemInfos,
                            false,
                        )
                    const systemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    webviewView.webview.postMessage({
                        command: "systems",
                        payload: JSON.stringify({
                            systemInfo: systemInfo,
                            supportedModels: SUPPORTED_MODELS_DETAILS,
                            selectedSystem: systemInfo[0]
                                ? systemInfo[0].name
                                : "",
                        }),
                    })
                    await this.activateSystem(systemInfo[0].name)
                    break
                }
                case "activate": {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const system_name = message.data as string
                    await this.activateSystem(system_name)
                    break
                }
                case "update": {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const newSystemDetails = message.data as SystemInfo
                    const originalSystemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    const updatedSystemInfos = originalSystemInfo.map(
                        (system) => {
                            if (system.isActive) {
                                return {
                                    ...system,
                                    name: newSystemDetails.name,
                                    localNode: newSystemDetails.localNode,
                                    slots: newSystemDetails.slots,
                                    nodes: newSystemDetails.nodes,
                                }
                            }
                            return system
                        },
                    )
                    await vscode.workspace
                        .getConfiguration("tsp")
                        .update(
                            "tspLinkSystemConfigurations",
                            updatedSystemInfos,
                            false,
                        )

                    const systemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    webviewView.webview.postMessage({
                        command: "systemUpdated",
                        payload: JSON.stringify({
                            systemInfo: systemInfo,
                        }),
                    })

                    break
                }
            }
        })
    }

    private reloadUi(webviewView: vscode.WebviewView) {
        const savedSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        const activeSystem = savedSystems.find((system) => system.isActive)
        webviewView.webview.postMessage({
            command: "systems",
            payload: JSON.stringify({
                systemInfo: savedSystems,
                supportedModels: SUPPORTED_MODELS_DETAILS,
                selectedSystem: activeSystem ? activeSystem.name : null,
            }),
        })
    }

    private async activateSystem(systemName: string) {
        const originalSystemInfo: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        const item = systemName
        const updatedSystemInfos = originalSystemInfo.map((sys) => {
            if (sys.name === item) {
                return { ...sys, isActive: true }
            } else {
                return { ...sys, isActive: false }
            }
        })
        await vscode.workspace
            .getConfiguration("tsp")
            .update("tspLinkSystemConfigurations", updatedSystemInfos, false)
        vscode.window.showInformationMessage(
            `The system configuration "${item}" has been activated.`,
        )
    }

    private render_new_system(system_name: string) {
        const savedSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        this._webviewView.webview.postMessage({
            command: "systems",
            payload: JSON.stringify({
                systemInfo: savedSystems,
                supportedModels: SUPPORTED_MODELS_DETAILS,
                selectedSystem: system_name,
            }),
        })
    }
    private async getSystemName() {
        const existingSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        const systemWithEmptyName = existingSystems.find(
            (system) => !system.name,
        )
        if (systemWithEmptyName) {
            const name = await this.getNewSystemName()
            if (name) {
                systemWithEmptyName.name = name
                await vscode.workspace
                    .getConfiguration("tsp")
                    .update(
                        "tspLinkSystemConfigurations",
                        existingSystems,
                        false,
                    )
                this.render_new_system(systemWithEmptyName.name)
                await this.activateSystem(systemWithEmptyName.name)
            } else {
                const updatedSystems = existingSystems.filter(
                    (system) => system !== systemWithEmptyName,
                )
                await vscode.workspace
                    .getConfiguration("tsp")
                    .update(
                        "tspLinkSystemConfigurations",
                        updatedSystems,
                        false,
                    )
            }
        }
    }

    private async getNewSystemName() {
        const existingSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        const options: vscode.InputBoxOptions = {
            prompt: "Enter new system name",
            validateInput: (value) => {
                const trimmedValue = value.trim()
                if (!trimmedValue) {
                    return "System name cannot be empty"
                }
                const isDuplicate = existingSystems.some(
                    (system: { name: string }) => system.name === trimmedValue,
                )
                if (isDuplicate) {
                    return "Duplicate system name not allowed"
                }
                return null
            },
        }
        const name = await vscode.window.showInputBox(options)
        return name
    }

    private getNonce() {
        let text = ""
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length))
        }
        return text
    }

    private getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
        return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList))
    }
}
