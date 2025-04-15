import * as vscode from "vscode"
import { Uri, Webview, WebviewView, WebviewViewProvider } from "vscode"
import {
    NO_WORKSPACE_OPEN,
    SUPPORTED_MODELS_DETAILS,
    SystemInfo,
} from "./resourceManager"
import { updateLuaLibraryConfigurations } from "./workspaceManager"

export class ConfigWebView implements WebviewViewProvider {
    public static readonly viewType = "systemConfigurations"
    constructor(private readonly _extensionUri: Uri) {}
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.WebviewViewResolveContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken,
    ) {
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

        vscode.commands.registerCommand(
            "systemConfigurations.addSystem",
            () => {
                if (!vscode.workspace.workspaceFolders) {
                    vscode.window.showInformationMessage(`${NO_WORKSPACE_OPEN}`)
                    return
                }
                webviewView.webview.postMessage({
                    command: "supportedModels",
                    payload: JSON.stringify(SUPPORTED_MODELS_DETAILS),
                })
            },
        )
        // Register a callback for configuration changes
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("tsp.tspLinkSystemConfigurations")) {
                await updateLuaLibraryConfigurations()
                this.reloadUi(webviewView)
            }
        })
    }
    private _getWebviewContent(webview: Webview) {
        if (!vscode.workspace.workspaceFolders) {
            return `<!DOCTYPE html>
            <html lang="en">
            <head></head>
            <body>
            <h1>${NO_WORKSPACE_OPEN}</h1>
            </body>
            </html>`
        } else {
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
    }

    private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            switch (message.command) {
                case "getInitialSystems": {
                    this.reloadUi(webviewView)
                    break
                }
                case "add":
                    {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        const newSystemDetails = message.data as SystemInfo
                        console.log(newSystemDetails)
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
                        const systemInfo: SystemInfo[] =
                            vscode.workspace
                                .getConfiguration("tsp")
                                .get("tspLinkSystemConfigurations") ?? []

                        webviewView.webview.postMessage({
                            command: "systems",
                            payload: JSON.stringify({
                                systemInfo,
                                supportedModels: SUPPORTED_MODELS_DETAILS,
                            }),
                        })
                        break
                    }

                    break
                case "remove": {
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
                            systemInfo,
                            supportedModels: SUPPORTED_MODELS_DETAILS,
                        }),
                    })
                    break
                }
                case "activate": {
                    const originalSystemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    const item = message.data
                    const updatedSystemInfos = originalSystemInfo.map((sys) => {
                        if (sys.name === item) {
                            return { ...sys, isActive: true }
                        } else {
                            return { ...sys, isActive: false }
                        }
                    })
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
                            systemInfo,
                            supportedModels: SUPPORTED_MODELS_DETAILS,
                        }),
                    })
                    break
                }

                case "update":
                    break
            }
        })
    }

    private reloadUi(webviewView: vscode.WebviewView) {
        const savedSystems: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        webviewView.webview.postMessage({
            command: "systems",
            payload: JSON.stringify({
                systemInfo: savedSystems,
                supportedModels: SUPPORTED_MODELS_DETAILS,
            }),
        })
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
