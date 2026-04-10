import * as vscode from "vscode"
import { ScriptGenDataProvider } from "./scriptGenDataProvider"
import { TriggerFlowDataProvider } from "./triggerFlowDataProvider"
import {
    OpenFolderTreeItem,
    SessionInstanceTreeItem,
    SessionTypeTreeItem,
} from "./genericSessionDataProvider"

type TreeItemType =
    | SessionTypeTreeItem
    | SessionInstanceTreeItem
    | OpenFolderTreeItem

/**
 * Combined data provider that manages both Script Gen and Trigger Flow views
 * Shows both as separate top-level nodes in the tree
 */
export class CombinedScriptGenDataProvider
implements vscode.TreeDataProvider<TreeItemType>
{
    private _onDidChangeTreeData: vscode.EventEmitter<
        TreeItemType | undefined | void
    > = new vscode.EventEmitter<TreeItemType | undefined | void>()

    readonly onDidChangeTreeData: vscode.Event<
        TreeItemType | undefined | void
    > = this._onDidChangeTreeData.event

    constructor(
        private readonly scriptGenProvider: ScriptGenDataProvider,
        private readonly triggerFlowProvider: TriggerFlowDataProvider,
    ) {
        // Forward refresh events from both providers
        scriptGenProvider.onDidChangeTreeData(() => {
            this._onDidChangeTreeData.fire()
        })
        triggerFlowProvider.onDidChangeTreeData(() => {
            this._onDidChangeTreeData.fire()
        })
    }

    getTreeItem(element: TreeItemType): vscode.TreeItem {
        return element
    }

    async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
        // Check if workspace is open
        if (
            !vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0
        ) {
            return [
                new SessionTypeTreeItem(
                    "You have not yet opened a folder.",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                ),
                new OpenFolderTreeItem(),
            ]
        }

        if (!element) {
            // Root level - return both session type nodes
            const scriptGenNodes = await this.scriptGenProvider.getChildren()
            const triggerFlowNodes =
                await this.triggerFlowProvider.getChildren()
            return [...scriptGenNodes, ...triggerFlowNodes]
        }

        // Determine which provider owns this element and delegate
        if (element instanceof SessionTypeTreeItem) {
            if (element.contextValue === "SavedIVCharTreeItem") {
                return this.scriptGenProvider.getChildren(element)
            } else if (element.contextValue === "SavedTriggerFlowTreeItem") {
                return this.triggerFlowProvider.getChildren(element)
            }
        }

        return []
    }

    getParent(element: TreeItemType): vscode.ProviderResult<TreeItemType> {
        // Determine which provider owns this element
        if (element instanceof SessionInstanceTreeItem) {
            if (
                element.contextValue === "SavedIVCharInstance" ||
                element.contextValue === "ActiveSavedIVCharInstance"
            ) {
                return this.scriptGenProvider.getParent(element)
            } else if (
                element.contextValue === "SavedTriggerFlowInstance" ||
                element.contextValue === "ActiveSavedTriggerFlowInstance"
            ) {
                return this.triggerFlowProvider.getParent(element)
            }
        }
        return undefined
    }

    refresh(): void {
        this._onDidChangeTreeData.fire()
    }
}
