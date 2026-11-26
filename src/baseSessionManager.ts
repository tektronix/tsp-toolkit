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
    GET_SCRIPT_EDITOR_STATE = "get_script_editor_state",
    UPDATE_SESSION = "update_session",
    CREATE_NEW_SESSION = "create_new_session",
    OPEN_MANUAL = "open_manual",
    GET_INITIAL_CONFIGURATION = "get_initial_configuration",
    SAVE_AS_GENERATED_SCRIPT = "save_as_generated_script",
    OPEN_SAVED_SCRIPT = "open_saved_script",
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
    // Panel-scoped listeners are removed when the Script Generation UI closes.
    private scriptEditorStateDisposables: vscode.Disposable[] = []
    // Path identifies the session; tab identity distinguishes duplicate editors of that file.
    private openScriptButtonScriptPath: string | undefined
    private openScriptButtonOwnedTab: vscode.Tab | undefined
    // Guard: prevents webview messages from writing back session data during deleteAll
    private isDeletingAllSessions = false

    // Mapping of block names to manual URLs for the OPEN_MANUAL command
    // in future, this details we can keep catalog file?.
    private blockNameandManualUrlMap: Record<string, string> = {
        MEASURE: "114968.htm",
        "LOG EVENT": "115503.htm",
        NOTIFY: "114971.htm",
        "MEASURE OVERLAPPED": "114969.htm",
        "WAIT ON EVENT": "114975.htm",
        "NO OPERATION": "114970.htm",
        branch: "117325.htm",
        "ONCE EXCLUDED": "114965.htm",
        "< LOOP COUNTER": "114961.htm",
        ONCE: "114964.htm",
        "ON EVENT": "114966.htm",
        ALWAYS: "114960.htm",
        "CONFIG LIST RECALL": "115501.htm",
        "CONFIG LIST PREV": "115500.htm",
        "CONFIG LIST NEXT": "115499.htm",
        "SOURCE OUTPUT": "114974.htm",
        "CONSTANT DELAY": "114967.htm",
        "SOURCE ACTION SKIP": "115827.htm",
        "SOURCE ACTION SET": "132966.htm",
        "SOURCE ACTION BIAS": "115504.htm",
        "SOURCE ACTION STEP": "114973.htm",
        "RESET BRANCH COUNTER": "114972.htm",
    }

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
            async () => {
                await this.deleteAllSessions()
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
                console.log(`${this.config.sessionType} stdout: ${output}`)
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
     * Open the webview panel
     */
    protected async openPanel(): Promise<void> {
        if (!this.panel) {
            const panel = this.createWebviewPanel()
            this.panel = panel
            this.setWebviewIcon()
            // Register before loading webview HTML so its initial state query is not missed.
            this.setupWebviewMessageListener(panel)
            this.setupScriptEditorStateListeners()
            this.setupThemeChangeListener()
            this.setupPanelDisposal()

            try {
                await this.checkServerReady(
                    `http://127.0.0.1:${this.config.serverPort}`,
                    10000,
                )
                if (this.panel !== panel) {
                    return
                }
                await this.loadWebviewContent(panel)
            } catch (error) {
                if (this.panel !== panel) {
                    return
                }
                this.handleError(
                    panel,
                    "Error starting server or loading content",
                    error as Error,
                )
                return
            }
        } else {
            this.panel.reveal()
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
    private setupWebviewMessageListener(panel: vscode.WebviewPanel): void {
        panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
            this.handleWebviewMessage(message, panel)
        })
    }

    /**
     * Handle messages from webview
     */
    protected handleWebviewMessage(
        message: WebviewMessage,
        sourcePanel?: vscode.WebviewPanel,
    ): void {
        // Drop all messages while a deleteAll is in progress to prevent
        // the Rust process from writing sessions back after they were cleared
        if (this.isDeletingAllSessions) {
            return
        }
        switch (message.command as WebviewCommandType) {
            case WebviewCommandType.OPEN_SCRIPT:
                void this.openGeneratedScript(sourcePanel)
                break
            case WebviewCommandType.SAVE_AS_GENERATED_SCRIPT:
                void this.chooseSaveAsTarget()
                break
            case WebviewCommandType.OPEN_SAVED_SCRIPT:
                void this.openSavedScript(vscode.Uri.file(message.payload))
                break
            case WebviewCommandType.GET_SCRIPT_EDITOR_STATE:
                this.postScriptEditorState()
                break
            case WebviewCommandType.CREATE_NEW_SESSION:
                if (this.sessionName) {
                    this.saveSession(
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
                try {
                    const payload = message.payload as unknown
                    const blockData =
                        typeof payload === "string"
                            ? (JSON.parse(payload) as {
                                  block_name?: string
                              })
                            : (payload as { block_name?: string })

                    if (blockData.block_name) {
                        this.openManual(blockData.block_name)
                    } else {
                        console.error(
                            "Missing block_name in OPEN_MANUAL payload",
                        )
                    }
                } catch {
                    console.error("Invalid payload for OPEN_MANUAL command")
                }
                break
            case WebviewCommandType.GET_INITIAL_CONFIGURATION:
                this.sendInitialConfiguration()
                break
            default:
                console.warn(`Unknown command from webview: ${message.command}`)
        }
    }

    /**
     * Open or focus the generated script and associate the button with that editor tab.
     */
    private async openGeneratedScript(
        originatingPanel: vscode.WebviewPanel | undefined = this.panel,
    ): Promise<void> {
        if (!originatingPanel || this.panel !== originatingPanel) {
            return
        }

        const scriptPath = this.getGeneratedScriptPath()
        if (!scriptPath) {
            if (!vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath) {
                vscode.window.showErrorMessage("No workspace folder found")
            } else if (!this.sessionName) {
                vscode.window.showErrorMessage("No session name found")
            }
            this.openScriptButtonScriptPath = undefined
            this.postScriptEditorState()
            return
        }

        const scriptUri = vscode.Uri.file(scriptPath)
        try {
            // Await the editor before resolving its group's active tab; opening can fail.
            const editor = await vscode.window.showTextDocument(scriptUri, {
                viewColumn: vscode.ViewColumn.Beside,
            })
            if (this.panel !== originatingPanel) {
                return
            }
            const tab = vscode.window.tabGroups.all.find(
                (group) => group.viewColumn === editor.viewColumn,
            )?.activeTab

            // Own only the tab revealed by this action, never other tabs for the same file.
            if (
                tab?.input instanceof vscode.TabInputText &&
                this.isScriptPath(tab.input.uri.fsPath, scriptPath)
            ) {
                this.openScriptButtonScriptPath = scriptPath
                this.openScriptButtonOwnedTab = tab
            } else {
                this.openScriptButtonScriptPath = undefined
                this.openScriptButtonOwnedTab = undefined
                console.warn(
                    "Could not identify the script tab opened by Open Script",
                )
            }
            this.postScriptEditorState()
        } catch (error: unknown) {
            if (this.panel !== originatingPanel) {
                return
            }
            this.openScriptButtonScriptPath = undefined
            this.openScriptButtonOwnedTab = undefined
            this.postScriptEditorState()
            const detail =
                error instanceof Error ? error.message : String(error)
            void vscode.window.showErrorMessage(
                `Failed to open script: ${scriptPath}. Error: ${detail}`,
            )
        }
    }

    /**
     * Resolve the generated script file belonging to the current session.
     */
    private getGeneratedScriptPath(): string | undefined {
        const workspacePath =
            vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        if (!workspacePath || !this.sessionName) {
            return undefined
        }

        return path.join(
            workspacePath,
            `${this.sessionName}.${this.config.scriptExtension}`,
        )
    }

    /**
     * Compare script paths consistently on case-insensitive Windows filesystems.
     */
    private isScriptPath(documentPath: string, scriptPath: string): boolean {
        const normalizedDocumentPath = path.resolve(documentPath)
        const normalizedScriptPath = path.resolve(scriptPath)

        // Windows paths may differ only by case when supplied by VS Code.
        return process.platform === "win32"
            ? normalizedDocumentPath.toLowerCase() ===
                  normalizedScriptPath.toLowerCase()
            : normalizedDocumentPath === normalizedScriptPath
    }

    /**
     * Return true only while the exact tab owned by the Open Script action exists.
     *
     * This is used to determine whether the Open Script button should be highlighted.
     *
     * It checks three conditions:
     * 1. A generated script path exists.
     * 2. The button has previously recorded ownership of a script path.
     * 3. The exact tab associated with the button is still open.
     */
    private isGeneratedScriptOpen(): boolean {
        const scriptPath = this.getGeneratedScriptPath()
        // An independently opened tab is insufficient: this session must own the live tab.
        return (
            scriptPath !== undefined &&
            this.openScriptButtonScriptPath !== undefined &&
            this.isScriptPath(this.openScriptButtonScriptPath, scriptPath) &&
            this.hasOpenScriptTab(scriptPath)
        )
    }

    /**
     * Check whether the Open Script-owned tab remains in any editor group.
     */
    private hasOpenScriptTab(scriptPath: string): boolean {
        // Compare tab identity, not only its URI, so a reopened copy cannot inherit ownership.
        return this.getScriptTabs(scriptPath).some(
            (tab) => this.openScriptButtonOwnedTab === tab,
        )
    }

    /**
     * Find text-editor tabs whose file path matches the generated script.
     */
    private getScriptTabs(scriptPath: string): vscode.Tab[] {
        return vscode.window.tabGroups.all.flatMap((group) =>
            group.tabs.filter(
                (tab) =>
                    tab.input instanceof vscode.TabInputText &&
                    this.isScriptPath(tab.input.uri.fsPath, scriptPath),
            ),
        )
    }

    /**
     * Send the derived active state to the webview for its button styling.
     */
    private postScriptEditorState(): void {
        const panel = this.panel
        if (!panel) {
            return
        }

        // The webview cannot inspect editor tabs; send only the derived button-active state.
        void panel.webview
            .postMessage({
                command: "script_editor_state",
                isOpen: this.isGeneratedScriptOpen(),
            })
            .then(
                (posted) => {
                    if (!posted) {
                        console.warn(
                            "Script editor state was not delivered to the webview",
                        )
                    }
                },
                (error: unknown) => {
                    console.error("Failed to send script editor state:", error)
                },
            )
    }

    /**
     * Keep the UI state synchronized with tab changes and clear closed-tab ownership.
     */
    private setupScriptEditorStateListeners(): void {
        const updateState = (): void => {
            const trackedScriptPath = this.openScriptButtonScriptPath
            if (
                trackedScriptPath !== undefined &&
                !this.hasOpenScriptTab(trackedScriptPath)
            ) {
                // Forget ownership on closure, even if another editor still shows this file.
                this.openScriptButtonScriptPath = undefined
                this.openScriptButtonOwnedTab = undefined
            }
            this.postScriptEditorState()
        }

        // Documents can remain cached after tab closure. Follow the button-owned
        // tab so unrelated tabs for the same file cannot keep the highlight active.
        this.scriptEditorStateDisposables = [
            vscode.window.tabGroups.onDidChangeTabs(updateState),
            vscode.window.tabGroups.onDidChangeTabGroups(updateState),
        ]
    }

    /**
     * Dispose tab listeners and reset ownership when the webview panel closes.
     */
    private disposeScriptEditorStateListeners(): void {
        // A newly opened UI must not inherit the previous panel's button ownership.
        for (const disposable of this.scriptEditorStateDisposables) {
            disposable.dispose()
        }
        this.scriptEditorStateDisposables = []
        this.openScriptButtonScriptPath = undefined
        this.openScriptButtonOwnedTab = undefined
    }
    
    /**
     * Ask for the Save As target first; the generator then writes the script
     * directly to the chosen file.
     */
    private async chooseSaveAsTarget(): Promise<void> {
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

        const defaultUri = vscode.Uri.file(
            path.join(
                workspacePath,
                `${this.sessionName}.${this.config.scriptExtension}`,
            ),
        )

        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                    "Script Files": [this.config.scriptExtension],
                },
            })
            if (!uri) {
                return
            }
            const delivered = await this.panel?.webview.postMessage({
                command: "save_as_target",
                path: uri.fsPath,
            })
            if (!delivered) {
                throw new Error("The script generator is no longer available")
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            vscode.window.showErrorMessage(
                `Failed to save generated script: ${errorMessage}`,
            )
        }
    }

    /**
     * Open the file chosen for Save As once the generator has written it
     */
    private async openSavedScript(uri: vscode.Uri): Promise<void> {
        if (!uri) {
            return
        }

        try {
            await vscode.window.showTextDocument(uri, {
                viewColumn: vscode.ViewColumn.Beside,
            })
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            vscode.window.showErrorMessage(
                `Failed to open saved script: ${errorMessage}`,
            )
        }
    }

    private openManual(blockName: string): void {
        console.log(`Opening manual for block: ${blockName}`)
        void vscode.commands.executeCommand(
            "kic.viewHelpDocument",
            `MSMU60-2/${this.blockNameandManualUrlMap[blockName]}`,
            blockName,
            vscode.ViewColumn.Beside,
        )
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
            this.disposeScriptEditorStateListeners()
            this.panel = undefined
            if (this.child) {
                this.child.stdin?.write('{"shutdown": true}\n')
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
    protected async deleteAllSessions(): Promise<void> {
        this.isDeletingAllSessions = true
        try {
            if (this.panel) {
                this.panel.dispose()
            }
            await this.removeAllSessions()
            this.deleteAllDataProviderItems()
        } finally {
            this.isDeletingAllSessions = false
        }
    }

    // Abstract methods to be implemented by subclasses
    protected abstract handleViewCommand(
        treeItem?: TSessionInstance,
    ): Promise<void>
    protected abstract getSessionLabel(treeItem: TSessionInstance): string
    protected abstract saveSession(name: string, config: string): void
    protected abstract updateSession(name: string, config: string): void
    protected abstract removeSession(name: string): void
    protected abstract removeAllSessions(): Promise<void>
    protected abstract getSessionConfig(name: string): string | undefined
    protected abstract sessionExists(name: string): boolean
    protected abstract refreshDataProvider(): void
    protected abstract deleteDataProviderItem(): void
    protected abstract deleteAllDataProviderItems(): void
    protected abstract setActiveStatus(name: string | undefined): void
    protected abstract listenToConfigChanges(): void
    protected abstract sendConfigData(): void
    protected abstract sendInitialConfiguration(): void
}
