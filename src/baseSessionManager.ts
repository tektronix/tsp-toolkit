import * as cp from "node:child_process"
import * as path from "node:path"
import * as vscode from "vscode"

/**
 * Configuration for session management
 */
export interface SessionConfig {
    /** Name of the executable */
    executablePath: string
    /** Port number for the web server */
    serverPort: number
    /** Title for the webview panel */
    panelTitle: string
    /** Icon paths for the webview panel */
    iconPaths: {
        light: string
        dark: string
    }
    /** VS Code command ID for viewing UI */
    viewCommandId: string
    /** VS Code command ID for deleting session */
    deleteCommandId: string
    /** VS Code command ID for deleting all sessions */
    deleteAllCommandId: string
    /** Session type identifier (e.g., "I-V Characterization", "Trigger Flow") */
    sessionType: string
    /** File extension for generated scripts (e.g., "tsp") */
    scriptExtension: string
}

/**
 * Message received from webview
 */
export interface WebviewMessage {
    command: string
    payload: string
}

/**
 * Commands that can be sent from webview
 */
export enum WebviewCommandType {
    OPEN_SCRIPT = "open_script",
    UPDATE_SESSION = "update_session",
    OPEN_MANUAL = "open_manual",
}

/**
 * Generic base class for session management (Script Gen, Trigger Flow, etc.)
 * Handles child process management, webview lifecycle, and communication with Rust executables
 */
export abstract class BaseSessionManager<TDataProvider, TSessionInstance> {
    protected child: cp.ChildProcess | undefined
    protected panel: vscode.WebviewPanel | undefined
    protected existingSystems: unknown[] = []
    protected treeview?: vscode.TreeView<TSessionInstance>
    protected sessionName: string | undefined
    protected lastSentData: string | undefined

    constructor(
        protected readonly context: vscode.ExtensionContext,
        protected readonly config: SessionConfig,
        protected readonly dataProvider?: TDataProvider,
    ) {
        this.registerCommands()
        this.listenToConfigChanges()
        this.loadSystemConfigurations()
    }

    /**
     * Register all commands for this session type
     */
    private registerCommands(): void {
        // View UI command
        const viewCmd = vscode.commands.registerCommand(
            this.config.viewCommandId,
            async (treeItem?: TSessionInstance) => {
                await this.handleViewCommand(treeItem)
            },
        )
        this.context.subscriptions.push(viewCmd)

        // Delete session command
        const deleteCmd = vscode.commands.registerCommand(
            this.config.deleteCommandId,
            (treeItem?: TSessionInstance) => {
                if (treeItem) {
                    this.deleteSession(this.getSessionLabel(treeItem))
                }
            },
        )
        this.context.subscriptions.push(deleteCmd)

        // Delete all sessions command
        const deleteAllCmd = vscode.commands.registerCommand(
            this.config.deleteAllCommandId,
            () => {
                this.deleteAllSessions()
            },
        )
        this.context.subscriptions.push(deleteAllCmd)
    }

    /**
     * Load system configurations from workspace settings
     */
    protected loadSystemConfigurations(): void {
        this.existingSystems =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []
    }

    /**
     * Spawn the Rust executable child process
     */
    protected spawnChildProcess(): void {
        if (!this.child || this.child.killed || this.child.exitCode !== null) {
            this.child = cp.spawn(this.config.executablePath)

            this.child.stdout?.on("data", (data: Buffer) => {
                const output = data.toString()
                this.handleChildStdout(output, this.sessionName)
            })

            this.child.on("error", (error) => {
                console.error(
                    `Error starting ${this.config.sessionType} executable: ${error.message}`,
                )
                if (this.panel) {
                    this.panel.webview.html = `<h1>Error starting ${this.config.sessionType} executable</h1>`
                }
            })

            this.child.stderr?.on("data", (error: Buffer) => {
                console.error(
                    `${this.config.sessionType} stderr: ${error.toString()}`,
                )
            })
        }
    }

    /**
     * Handle stdout data from child process
     */
    protected handleChildStdout(
        output: string,
        sessionName: string | undefined,
    ): void {
        console.log(
            `Received data from ${this.config.sessionType} executable: ${output}`,
        )

        if (output.includes("instrument data requested")) {
            const name = sessionName || "default_session"
            this.sendSessionPathData(name)
            this.sendConfigData()
            this.lastSentData = name
        }

        // Handle initial response and save session
        if (
            output.includes('"request_type":"initial_response"') &&
            sessionName
        ) {
            this.saveSession(
                sessionName,
                output.substring(output.indexOf('{"request_type"')),
            )
        }
    }

    /**
     * Open the webview panel
     */
    protected async openPanel(): Promise<void> {
        if (!this.panel) {
            this.panel = this.createWebviewPanel()
            this.setWebviewIcon()

            try {
                await this.checkServerReady(
                    `http://127.0.0.1:${this.config.serverPort}`,
                    10000,
                )
                await this.loadWebviewContent(this.panel)
            } catch (error) {
                this.handleError(
                    this.panel,
                    "Error starting server or loading content",
                    error as Error,
                )
                return
            }

            this.setupWebviewMessageListener()
            this.setupThemeChangeListener()
            this.setupPanelDisposal()
        }
    }

    /**
     * Create webview panel
     */
    private createWebviewPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            "webview",
            this.config.panelTitle,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        )
    }

    /**
     * Set webview panel icon
     */
    private setWebviewIcon(): void {
        if (this.panel) {
            this.panel.iconPath = {
                light: vscode.Uri.file(this.config.iconPaths.light),
                dark: vscode.Uri.file(this.config.iconPaths.dark),
            }
        }
    }

    /**
     * Setup webview message listener
     */
    private setupWebviewMessageListener(): void {
        this.panel?.webview.onDidReceiveMessage((message: WebviewMessage) => {
            this.handleWebviewMessage(message)
        })
    }

    /**
     * Handle messages from webview
     */
    protected handleWebviewMessage(message: WebviewMessage): void {
        switch (message.command as WebviewCommandType) {
            case WebviewCommandType.OPEN_SCRIPT:
                this.openGeneratedScript()

                break
            case WebviewCommandType.UPDATE_SESSION:
                if (this.sessionName) {
                    this.updateSession(
                        this.sessionName,
                        message.payload.substring(
                            message.payload.indexOf('{"request_type"'),
                        ),
                    )
                } else {
                    console.error(
                        "Cannot update session: sessionName is undefined",
                    )
                }
                break
            case WebviewCommandType.OPEN_MANUAL:
                //this.openManual(message.payload)

                // const blockName = message.payload.substring(
                //     message.payload.indexOf('{"block_name":"') + 15,
                //     message.payload.indexOf('"}'),
                // )
                // this.openManual(blockName)
                void vscode.commands.executeCommand(
                    "kic.viewHelpDocument",
                    "MPSU50-2ST/115504.htm",
                    vscode.ViewColumn.Beside,
                )

                break
            default:
                console.warn(`Unknown command from webview: ${message.command}`)
        }
    }

    /**
     * Open the generated script file
     */
    private openGeneratedScript(): void {
        const workspacePath =
            vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        if (!workspacePath) {
            vscode.window.showErrorMessage("No workspace folder found")
            return
        }

        if (!this.sessionName) {
            vscode.window.showErrorMessage("No session name found")
            return
        }

        const scriptPath = path.join(
            workspacePath,
            `${this.sessionName}.${this.config.scriptExtension}`,
        )
        const scriptUri = vscode.Uri.file(scriptPath)

        const isAlreadyOpen = vscode.window.visibleTextEditors.some(
            (editor) => editor.document.uri.fsPath === scriptPath,
        )

        if (!isAlreadyOpen) {
            try {
                void vscode.window.showTextDocument(scriptUri, {
                    viewColumn: vscode.ViewColumn.Beside,
                })
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to open script: ${scriptPath}. Error: ${(error as Error).message}`,
                )
            }
        }
    }

    private openManual(blockName: string): void {
        console.log(`Opening manual for block: ${blockName}`)
    }

    /**
     * Setup theme change listener
     */
    private setupThemeChangeListener(): void {
        vscode.window.onDidChangeActiveColorTheme(() => {
            if (this.panel && this.child) {
                this.sendThemeRefreshSignal()
                console.log("Theme refresh signal sent to server")
            }
        })
    }

    /**
     * Setup panel disposal handler
     */
    private setupPanelDisposal(): void {
        this.panel?.onDidDispose(() => {
            this.panel = undefined
            if (this.child) {
                this.child.stdin?.write("shutdown\n")
            }
            this.setActiveStatus(undefined)
        })
    }

    /**
     * Send reset signal to child process
     */
    protected sendResetSignal(): void {
        const payload = { reset: true }
        if (this.child?.stdin) {
            this.child.stdin.write(`${JSON.stringify(payload)}\n`)
            console.log(`Sent reset signal: ${JSON.stringify(payload)}`)
        }
    }

    /**
     * Send session path data to child process
     */
    protected sendSessionPathData(name: string): void {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        const payload = { session: name, folder: workspacePath }
        if (this.child?.stdin) {
            this.child.stdin.write(`${JSON.stringify(payload)}\n`)
            console.log(`Sent session path data: ${JSON.stringify(payload)}`)
        }
    }

    /**
     * Send theme refresh signal to child process
     */
    protected sendThemeRefreshSignal(): void {
        const payload = { refresh: true, reason: "theme-change" }
        if (this.child?.stdin) {
            this.child.stdin.write(`${JSON.stringify(payload)}\n`)
            console.log(`Sent theme refresh signal: ${JSON.stringify(payload)}`)
        }
    }

    /**
     * Send saved session data to child process
     */
    protected sendSessionData(sessionName: string): void {
        const config = this.getSessionConfig(sessionName)
        if (this.child?.stdin && config) {
            this.child.stdin.write(`${config}\n`)
            console.log(`Sent session data to executable: ${config}`)
        }
    }

    /**
     * Check if server is ready
     */
    protected async checkServerReady(
        url: string,
        timeout: number,
    ): Promise<boolean> {
        const start = Date.now()
        while (Date.now() - start < timeout) {
            try {
                const response = await fetch(url)
                if (response.ok) return true
            } catch {
                // Ignore errors and retry
            }
            await this.delay(500)
        }
        throw new Error("Server did not start in time")
    }

    /**
     * Delay utility
     */
    protected delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Load webview content from server
     */
    protected async loadWebviewContent(
        panel: vscode.WebviewPanel,
    ): Promise<void> {
        try {
            const fullWebServerUri = await vscode.env.asExternalUri(
                vscode.Uri.parse(`http://127.0.0.1:${this.config.serverPort}`),
            )
            const response = await fetch(fullWebServerUri.toString())
            const html = await response.text()
            panel.webview.html = html
        } catch (error) {
            throw new Error(
                `Failed to load webview content: ${(error as Error).message}`,
            )
        }
    }

    /**
     * Handle error
     */
    protected handleError(
        panel: vscode.WebviewPanel,
        message: string,
        error: Error,
    ): void {
        console.error(`${message}: ${error.message}`)
        panel.webview.html = `<h1>${message}</h1>`
    }

    /**
     * Check if system configurations exist
     */
    protected hasSystemConfigurations(): boolean {
        return this.existingSystems.length > 0
    }

    /**
     * Delete a session
     */
    protected deleteSession(name: string): void {
        this.removeSession(name)
        this.deleteDataProviderItem()
    }

    /**
     * Delete all sessions
     */
    protected deleteAllSessions(): void {
        if (this.panel) {
            this.panel.dispose()
        }
        this.removeAllSessions()
        this.deleteAllDataProviderItems()
    }

    // Abstract methods to be implemented by subclasses
    protected abstract handleViewCommand(
        treeItem?: TSessionInstance,
    ): Promise<void>
    protected abstract getSessionLabel(treeItem: TSessionInstance): string
    protected abstract saveSession(name: string, config: string): void
    protected abstract updateSession(name: string, config: string): void
    protected abstract removeSession(name: string): void
    protected abstract removeAllSessions(): void
    protected abstract getSessionConfig(name: string): string | undefined
    protected abstract sessionExists(name: string): boolean
    protected abstract refreshDataProvider(): void
    protected abstract deleteDataProviderItem(): void
    protected abstract deleteAllDataProviderItems(): void
    protected abstract setActiveStatus(name: string | undefined): void
    protected abstract listenToConfigChanges(): void
    protected abstract sendConfigData(): void
}
