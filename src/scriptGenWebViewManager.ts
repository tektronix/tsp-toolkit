import * as cp from "node:child_process"
import path, { join } from "node:path"
import * as vscode from "vscode"
import { SCRIPT_GEN_EXECUTABLE } from "./kic-script-gen-cli"
import {
    savedScriptGenInstance,
    selectScriptGenDataProvider,
    SelectScriptGenInstance,
} from "./selectScriptGenDataProvider"
import {
    SavedScriptGenManager,
    scriptNameValidator,
} from "./savedScriptGenManager"

interface WebviewMessage {
    command: CommandType
}

enum CommandType {
    open_script = "open_script",
}
const savedScriptGenManager = new SavedScriptGenManager()
export class ScriptGenWebViewMgr {
    private child: cp.ChildProcess | undefined
    private panel!: vscode.WebviewPanel | undefined
    private existingSystems = []
    private treeview?: vscode.TreeView<SelectScriptGenInstance>
    private scriptName: string | undefined
    private last_SentData: string | undefined

    constructor(
        context: vscode.ExtensionContext,
        private selectScriptGenData?: selectScriptGenDataProvider,
    ) {
        // Register the commands
        const viewScriptGenUICmd = vscode.commands.registerCommand(
            "tsp.viewScriptGenUI",
            async (
                treeItem?: SelectScriptGenInstance | savedScriptGenInstance,
            ) => {
                if (treeItem?.contextValue === "SavedIVCharTreeItem") {
                    await this.viewScriptGenUI()
                    selectScriptGenData?.setActiveStatus(this.scriptName)
                } else if (treeItem?.contextValue === "SavedIVCharInstance") {
                    this.treeview?.reveal(treeItem, { focus: true })

                    if (this.last_SentData !== treeItem.label) {
                        this.scriptName = treeItem.label
                        this.sendScriptPathData(this.scriptName)
                        this.last_SentData = treeItem.label
                    }
                    this.scriptName = treeItem.label
                    this.spawnScriptGen()
                    this.sendScriptGenData(this.scriptName)
                    await this.openScriptGenPanel()
                    selectScriptGenData?.setActiveStatus(this.scriptName)
                }
            },
        )
        context.subscriptions.push(viewScriptGenUICmd)

        const deleteScriptGenSessionCmd = vscode.commands.registerCommand(
            "tsp.deleteScriptGenSession",
            (treeItem?: savedScriptGenInstance) => {
                if (treeItem) {
                    this.deleteScriptGenUI(treeItem.label)
                }
            },
        )

        context.subscriptions.push(deleteScriptGenSessionCmd)

        this.existingSystems =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []

        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("tsp.tspLinkSystemConfigurations")) {
                this.existingSystems =
                    vscode.workspace
                        .getConfiguration("tsp")
                        .get("tspLinkSystemConfigurations") ?? []
                this.sendSystemConfigData()
                this.selectScriptGenData?.refresh()
            }
        })
    }

    private spawnScriptGen() {
        if (!this.child || this.child.killed || this.child.exitCode !== null) {
            this.child = cp.spawn(SCRIPT_GEN_EXECUTABLE)
            this.child?.stdout?.on("data", (data: Buffer) => {
                const ip = data.toString()
                this.handleChildStdout(ip, this.scriptName)
            })
        }
    }

    async viewScriptGenUI() {
        if (this.existingSystems.length === 0) {
            vscode.window.showErrorMessage(
                "System configurations not found. Please configure a system first.",
            )
            return
        }

        let input: string | undefined
        let isValid: boolean = false
        while (!isValid) {
            input = await vscode.window.showInputBox({
                prompt: "Enter name for the script",
                placeHolder: "Type here",
            })

            if (input === undefined) {
                return
            }

            isValid = new scriptNameValidator().validateName(input)
        }

        this.scriptName = input // store the script name for later use

        // Start the Rust executable
        if (!this.child || this.child.killed || this.child.exitCode !== null) {
            this.child = cp.spawn(SCRIPT_GEN_EXECUTABLE)
            this.child?.stdout?.on("data", (data: Buffer) => {
                const ip = data.toString()
                this.handleChildStdout(ip, this.scriptName)
            })
        } else {
            this.sendResetScriptGen()
        }
        await this.openScriptGenPanel()
    }

    async openScriptGenPanel() {
        if (!this.panel) {
            this.panel = this.createWebviewPanel("TSP Script Generation")
            this.panel.iconPath = {
                light: vscode.Uri.file(
                    join(
                        __dirname,
                        "..",
                        "resources",
                        "light",
                        "script-gen-pane-icon.svg",
                    ),
                ),
                dark: vscode.Uri.file(
                    join(
                        __dirname,
                        "..",
                        "resources",
                        "dark",
                        "script-gen-pane-icon.svg",
                    ),
                ),
            }

            try {
                await this.checkServerReady("http://127.0.0.1:27950", 10000)
                await this.loadWebviewContent(this.panel)
            } catch (error) {
                this.handleError(
                    this.panel,
                    "Error starting server or loading content",
                    error as Error,
                )
                return
            }
            this._setWebviewMessageListener()
            this.checkThemeChange()

            this.panel.onDidDispose(() => {
                this.panel = undefined
                if (this.child) {
                    this.child.stdin?.write("shutdown\n")
                }

                if (this.selectScriptGenData) {
                    this.selectScriptGenData.setActiveStatus(undefined)
                }
            })
        }
    }

    private handleChildStdout(ip: string, input: string | undefined) {
        console.log(`Received data from Rust executable: ${ip}`)
        if (ip.includes("instrument data requested")) {
            const last_sent = input || "default_script"
            this.sendScriptPathData(last_sent)
            this.sendSystemConfigData()
            this.last_SentData = last_sent
        }
        // this will run for every change
        if (ip.includes('"request_type":"initial_response"') && input) {
            this.addScriptGenInstance(
                input,
                ip.substring(ip.indexOf('{"request_type"')),
            )
        }
        if (ip.includes('"request_type":"evaluated_response"') && input) {
            this.updateScriptGenInstance(
                input,
                ip.substring(ip.indexOf('{"request_type"')),
            )
        }

        this.child?.on("error", (error) => {
            console.error(`Error starting Rust executable: ${error.message}`)
            this.panel!.webview.html = "<h1>Error starting Rust executable</h1>"
        })
    }

    private sendSystemConfigData() {
        const payload = { systems: this.existingSystems }
        const chunk = JSON.stringify(payload)
        if (this.child) {
            this.child.stdin?.write(`${chunk}\n`)
            console.log(`Sent data to Rust executable: ${chunk}`)
        }
    }

    private sendResetScriptGen() {
        const payload = { reset: true }
        const chunk = JSON.stringify(payload)
        if (this.child) {
            this.child.stdin?.write(`${chunk}\n`)
            console.log(`Sent data to Rust executable: ${chunk}`)
        }
    }

    private sendScriptPathData(name: string) {
        const workfolderPath: string | undefined =
            vscode.workspace.workspaceFolders?.[0].uri.fsPath
        const payload = { session: name, folder: workfolderPath }
        const chunk = JSON.stringify(payload)
        if (this.child) {
            this.child.stdin?.write(`${chunk}\n`)
            console.log(`Sent script path data to Rust executable: ${chunk}`)
        }
    }

    private sendThemeRefreshSignal() {
        const payload = { refresh: true, reason: "theme-change" }
        const chunk = JSON.stringify(payload)
        if (this.child) {
            this.child.stdin?.write(`${chunk}\n`)
            console.log(
                `Sent theme refresh signal to Rust executable: ${chunk}`,
            )
        }
    }

    private checkThemeChange() {
        vscode.window.onDidChangeActiveColorTheme(() => {
            // Check if panel and child process exist before sending refresh signal
            if (this.panel && this.child) {
                this.sendThemeRefreshSignal()
                console.log("Theme refresh signal sent to server")
            }
        })
    }

    private sendScriptGenData(label: string) {
        if (!this.child) {
            this.child = cp.spawn(SCRIPT_GEN_EXECUTABLE)
        }
        const session = savedScriptGenManager.getConfig(label)
        if (this.child) {
            this.child.stdin?.write(`${session?.config}\n`)
            console.log(
                `Sent script generation data to Rust executable: ${session?.config}`,
            )
        }
    }

    private addScriptGenInstance(input: string, config: string) {
        if (!this.selectScriptGenData) {
            console.error("selectScriptGenData is not initialized")
            return
        }

        const configs =
            this.selectScriptGenData._savedConfigs["I-V Characterization"] ?? []
        if (configs.some((item) => item.name === input)) {
            this.updateScriptGenInstance(input, config)
            return
        } else {
            savedScriptGenManager.addSession(input, config) // add new instance to settings.json

            this.selectScriptGenData.addTreeItem(input, config) // add new instance to treeview
        }
    }

    private updateScriptGenInstance(input: string, config: string) {
        if (!this.selectScriptGenData) {
            console.error("selectScriptGenData is not initialized")
            return
        }

        savedScriptGenManager.updateSession(input, config) // add new instance to settings.json
    }

    deleteScriptGenUI(name: string) {
        savedScriptGenManager.removeSession(name)
        this.selectScriptGenData?.deleteTreeItem(name)
    }

    createWebviewPanel(title: string): vscode.WebviewPanel {
        // const localResourceRoot = vscode.Uri.file(
        //     path.join(
        //         "C:",
        //         "git",
        //         "TekSpecific",
        //         "tsp-toolkit-script-gen",
        //         "script-gen-ui",
        //         "dist",
        //         "script-gen-ui",
        //         "browser",
        //     ),
        // )
        return vscode.window.createWebviewPanel(
            "webview",
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                //localResourceRoots: [localResourceRoot],
                retainContextWhenHidden: true,
            },
        )
    }

    async checkServerReady(url: string, timeout: number): Promise<boolean> {
        const start = Date.now()
        while (Date.now() - start < timeout) {
            try {
                const response = await fetch(url)
                if (response.ok) return true
            } catch (error) {
                console.log(error)
                // Ignore errors and retry
            }
            await this.delay(500)
        }
        throw new Error("Server did not start in time")
    }

    delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    async loadWebviewContent(panel: vscode.WebviewPanel): Promise<void> {
        try {
            const fullWebServerUri = await vscode.env.asExternalUri(
                vscode.Uri.parse("http://127.0.0.1:27950"),
            )
            const response = await fetch(fullWebServerUri.toString())
            const html = await response.text()
            panel.webview.html = html
        } catch (error) {
            const err = error as Error
            throw new Error(`Failed to load webview content: ${err.message}`)
        }
    }

    handleError(
        panel: vscode.WebviewPanel,
        message: string,
        error: Error,
    ): void {
        console.error(`${message}: ${error.message}`)
        panel.webview.html = `<h1>${message}</h1>`
    }

    private _setWebviewMessageListener() {
        this.panel?.webview.onDidReceiveMessage((message: WebviewMessage) => {
            switch (message.command) {
                case CommandType.open_script: {
                    const workspacePath =
                        vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
                    if (workspacePath) {
                        const scriptPath = path.join(
                            workspacePath,
                            this.scriptName + ".tsp",
                        )
                        const scriptUri = vscode.Uri.file(scriptPath)
                        const isAlreadyOpen =
                            vscode.window.visibleTextEditors.some(
                                (editor) =>
                                    editor.document.uri.fsPath === scriptPath,
                            )

                        if (!isAlreadyOpen) {
                            try {
                                vscode.window.showTextDocument(scriptUri, {
                                    viewColumn: vscode.ViewColumn.Beside,
                                })
                            } catch (error) {
                                const err = error as Error
                                vscode.window.showErrorMessage(
                                    `Failed to open script: ${scriptPath}. Error: ${err.message}`,
                                )
                            }
                        }
                    } else {
                        vscode.window.showErrorMessage(
                            "No workspace folder found",
                        )
                    }
                    break
                }
            }
        })
    }
}
