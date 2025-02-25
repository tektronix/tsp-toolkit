import * as vscode from "vscode"
import { Uri, Webview, WebviewView, WebviewViewProvider } from "vscode"
import { SUPPORTED_MODELS_DETAILS, SystemInfo } from "./resourceManager"

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
            localResourceRoots: [Uri.joinPath(this._extensionUri, "out")],
        }

        // Set the HTML content that will fill the webview view
        webviewView.webview.html = this._getWebviewContent(webviewView.webview)

        // Sets up an event listener to listen for messages passed from the webview view context
        // and executes code based on the message that is recieved
        this._setWebviewMessageListener(webviewView)
    }
    private _getWebviewContent(webview: Webview) {
        if (!vscode.workspace.workspaceFolders) {
            return `<!DOCTYPE html>
            <html lang="en">
            <head></head>
            <body>
            <h1>No workspace has been open, please open an workspace and reload this UI</h1>
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
            const nonce = this.getNonce()
            return /*html*/ `
            <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${stylesUri.toString()}">
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
                    const systemInfo: SystemInfo[] =
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("tspLinkSystemConfigurations") ?? []

                    webviewView.webview.postMessage({
                        command: "systems",
                        payload: JSON.stringify(systemInfo),
                    })
                    break
                }
                case "getSupportedModels": {
                    webviewView.webview.postMessage({
                        command: "supportedModels",
                        payload: JSON.stringify(SUPPORTED_MODELS_DETAILS),
                    })
                    break
                }
                case "add":
                    {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        const item = message.data
                        console.log(item)
                        // const originalSystemInfo: SystemInfo[] =
                        //     vscode.workspace
                        //         .getConfiguration("tsp")
                        //         .get("tspLinkSystemConfigurations") ?? []

                        // const newItem: SystemInfo = {
                        //     name: item,
                        //     // Add other properties as needed
                        //     is_active: false,
                        //     localnode: "",
                        // }

                        // const updatedSystemInfos = [
                        //     ...originalSystemInfo,
                        //     newItem,
                        // ]

                        // await vscode.workspace
                        //     .getConfiguration("tsp")
                        //     .update(
                        //         "tspLinkSystemConfigurations",
                        //         updatedSystemInfos,
                        //         false,
                        //     )
                        // const systemInfo: SystemInfo[] =
                        //     vscode.workspace
                        //         .getConfiguration("tsp")
                        //         .get("tspLinkSystemConfigurations") ?? []

                        // webviewView.webview.postMessage({
                        //     command: "systems",
                        //     payload: JSON.stringify(systemInfo),
                        // })
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
                        payload: JSON.stringify(systemInfo),
                    })
                    break
                }

                case "update":
                    break
            }
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
