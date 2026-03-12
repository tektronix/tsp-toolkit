import * as path from "node:path"
import * as vscode from "vscode"

import { TRIGGER_FLOW_EXECUTABLE } from "./kic-script-trigger-flow-cli"
import { BaseSessionManager, SessionConfig } from "./baseSessionManager"
import {
    GenericSessionStorage,
    SessionNameValidator,
} from "./genericSessionStorage"
import { TriggerFlowDataProvider } from "./triggerFlowDataProvider"
import {
    SessionInstanceTreeItem,
    SessionTypeTreeItem,
} from "./genericSessionDataProvider"

/**
 * Trigger Flow specific session manager
 * Extends BaseSessionManager with Trigger Flow specific logic
 */
export class TriggerFlowWebViewManager extends BaseSessionManager<
    TriggerFlowDataProvider,
    SessionTypeTreeItem | SessionInstanceTreeItem
> {
    private readonly storage: GenericSessionStorage
    private readonly validator: SessionNameValidator

    constructor(
        context: vscode.ExtensionContext,
        dataProvider?: TriggerFlowDataProvider,
    ) {
        const config: SessionConfig = {
            executablePath: TRIGGER_FLOW_EXECUTABLE,
            serverPort: 27951, // Different port from script gen
            panelTitle: "Trigger Flow Canvas",
            iconPaths: {
                light: path.join(
                    __dirname,
                    "..",
                    "resources",
                    "light",
                    "script-gen-pane-icon.svg",
                ),
                dark: path.join(
                    __dirname,
                    "..",
                    "resources",
                    "dark",
                    "script-gen-pane-icon.svg",
                ),
            },
            viewCommandId: "tsp.viewTriggerFlowUI",
            deleteCommandId: "tsp.deleteTriggerFlowSession",
            deleteAllCommandId: "tsp.deleteAllTriggerFlowSessions",
            sessionType: "Trigger Flow",
            scriptExtension: "tsp",
        }

        super(context, config, dataProvider)

        this.storage = new GenericSessionStorage("Trigger Flow")
        this.validator = new SessionNameValidator(this.storage)
    }

    /**
     * Listen to workspace configuration changes
     */
    protected listenToConfigChanges(): void {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("tsp.tspLinkSystemConfigurations")) {
                this.loadSystemConfigurations()
                this.sendConfigData()
                this.refreshDataProvider()
            }
        })
    }

    /**
     * Send configuration data to child process
     */
    protected sendConfigData(): void {
        const payload = { systems: this.existingSystems }
        if (this.child?.stdin) {
            this.child.stdin.write(`${JSON.stringify(payload)}\n`)
            console.log(`Sent configuration data: ${JSON.stringify(payload)}`)
        }
    }

    /**
     * Handle view command from tree view
     */
    protected async handleViewCommand(
        treeItem?: SessionTypeTreeItem | SessionInstanceTreeItem,
    ): Promise<void> {
        // If clicked on category node, create new session
        if (
            treeItem?.contextValue === "SavedTriggerFlowTreeItem" ||
            !treeItem
        ) {
            await this.createNewSession()
        }
        // If clicked on session instance, open existing session
        else if (
            treeItem?.contextValue === "SavedTriggerFlowInstance" ||
            treeItem?.contextValue === "ActiveSavedTriggerFlowInstance"
        ) {
            if (
                this.dataProvider &&
                treeItem instanceof SessionInstanceTreeItem
            ) {
                // Update session data if different
                if (this.lastSentData !== treeItem.label) {
                    this.sessionName = treeItem.label
                    this.sendSessionPathData(this.sessionName)
                    this.lastSentData = treeItem.label
                }

                this.sessionName = treeItem.label
                this.spawnChildProcess()
                this.sendSessionData(this.sessionName)
                await this.openPanel()
                this.setActiveStatus(this.sessionName)
            }
        }
    }

    /**
     * Create a new session
     */
    private async createNewSession(): Promise<void> {
        if (!this.hasSystemConfigurations()) {
            vscode.window.showErrorMessage(
                "System configurations not found. Please configure a system first.",
            )
            return
        }

        let input: string | undefined
        let isValid = false

        while (!isValid) {
            input = await vscode.window.showInputBox({
                prompt: "Enter name for the trigger flow session",
                placeHolder: "e.g., My Trigger Flow",
            })

            if (input === undefined) {
                return // User cancelled
            }

            isValid = this.validator.validateName(input)
        }

        this.sessionName = input

        this.spawnChildProcess()
        await this.openPanel()
        this.setActiveStatus(this.sessionName)
    }

    /**
     * Get session label from tree item
     */
    protected getSessionLabel(
        treeItem: SessionTypeTreeItem | SessionInstanceTreeItem,
    ): string {
        return treeItem.label
    }

    /**
     * Save a new session
     */
    protected saveSession(name: string, config: string): void {
        if (!this.dataProvider) {
            vscode.window.showErrorMessage(
                "Data provider is not initialized. Cannot save session.",
            )
            return
        }

        if (this.storage.sessionExists(name)) {
            this.updateSession(name, config)
            return
        }

        this.storage.addSession(name, config)
        this.dataProvider.addTreeItem(name)
    }

    /**
     * Update an existing session
     */
    protected updateSession(name: string, config: string): void {
        if (!this.dataProvider) {
            vscode.window.showErrorMessage(
                "Data provider is not initialized. Cannot update session.",
            )
            return
        }

        this.storage.updateSession(name, config)
        this.dataProvider.refresh()
    }

    /**
     * Remove a session
     */
    protected removeSession(name: string): void {
        this.storage.removeSession(name)
    }

    /**
     * Remove all sessions
     */
    protected removeAllSessions(): void {
        this.storage.removeAllSessions()
    }

    /**
     * Get session configuration
     */
    protected getSessionConfig(name: string): string | undefined {
        const session = this.storage.getSession(name)
        return session?.config
    }

    /**
     * Check if session exists
     */
    protected sessionExists(name: string): boolean {
        return this.storage.sessionExists(name)
    }

    /**
     * Refresh data provider
     */
    protected refreshDataProvider(): void {
        this.dataProvider?.refresh()
    }

    /**
     * Delete data provider item
     */
    protected deleteDataProviderItem(): void {
        this.dataProvider?.deleteTreeItem()
    }

    /**
     * Delete all data provider items
     */
    protected deleteAllDataProviderItems(): void {
        this.dataProvider?.deleteAllTreeItems()
    }

    /**
     * Set active status in data provider
     */
    protected setActiveStatus(name: string | undefined): void {
        this.dataProvider?.setActiveStatus(name)
    }
}
