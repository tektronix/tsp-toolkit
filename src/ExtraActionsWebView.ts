import * as vscode from "vscode"
import { Uri, Webview, WebviewView, WebviewViewProvider } from "vscode"

export class ExtraActionsWebView implements WebviewViewProvider {
    public static readonly viewType = "extraActions"
    private _webviewView: vscode.WebviewView | undefined
    constructor(private readonly _extensionUri: Uri) {}

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
            "extraActions.js",
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
  <title>Extra Actions</title>
</head>

<body>
  <div id="action-container"></div>
    <script type="module" nonce="${nonce}" src="${webviewScriptUri.toString()}"></script>
    <button class="vscode-style-button" data-id="fetchExamples" id="fetchExamples" type="button">Fetch TSP Examples</button>
  </div>
</body>
</html>
`
    }

    private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            switch (message.command) {
                case "fetchExamples": {
                    await vscode.commands.executeCommand(
                        "tsp.fetchExampleScripts",
                    )
                    this._webviewView?.webview.postMessage({
                        command: "fetchComplete",
                    })
                    break
                }
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
