import * as vscode from "vscode"
import { GenericSessionStorage } from "./genericSessionStorage"

/**
 * Tree item for session type category (e.g., "I-V Characterization", "Trigger Flow")
 */
export class SessionTypeTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public contextValue: string,
    ) {
        super(label, collapsibleState)
    }
}

/**
 * Tree item for individual session instance
 */
export class SessionInstanceTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly sessionConfig: string,
        public contextValue: string,
        public commandString: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None)
        this.tooltip = `Session: ${label}`
        this.description = contextValue.includes("Active") ? "● Active" : ""
        this.command = {
            title: "Open Session",
            command: commandString,
            arguments: [this],
        }
    }
}

/**
 * Tree item for "Open Folder" action
 */
export class OpenFolderTreeItem extends vscode.TreeItem {
    constructor() {
        super("Open Folder", vscode.TreeItemCollapsibleState.None)
        this.command = {
            command: "vscode.openFolder",
            title: "Open Folder",
        }
        this.iconPath = new vscode.ThemeIcon("folder-opened")
    }
}

type TreeItemType =
    | SessionTypeTreeItem
    | SessionInstanceTreeItem
    | OpenFolderTreeItem

/**
 * Generic TreeDataProvider for session management
 */
export class GenericSessionDataProvider
implements vscode.TreeDataProvider<TreeItemType>
{
    private _onDidChangeTreeData: vscode.EventEmitter<
        TreeItemType | undefined | void
    > = new vscode.EventEmitter<TreeItemType | undefined | void>()

    readonly onDidChangeTreeData: vscode.Event<
        TreeItemType | undefined | void
    > = this._onDidChangeTreeData.event

    private treeview?: vscode.TreeView<TreeItemType>
    private sessionTypeNode: SessionTypeTreeItem
    public activeSessionName: string | undefined

    constructor(
        private readonly storage: GenericSessionStorage,
        private readonly sessionTypeLabel: string,
        private readonly treeItemContextValue: string,
        private readonly instanceContextValue: string,
        private readonly activeInstanceContextValue: string,
        private readonly commandId: string,
    ) {
        this.sessionTypeNode = new SessionTypeTreeItem(
            sessionTypeLabel,
            vscode.TreeItemCollapsibleState.Expanded,
            treeItemContextValue,
        )
    }

    /**
     * Set the tree view for this data provider
     */
    setTreeView(treeview: vscode.TreeView<TreeItemType>): void {
        this.treeview = treeview
    }

    /**
     * Get tree item
     */
    getTreeItem(element: TreeItemType): vscode.TreeItem {
        return element
    }

    /**
     * Add a new tree item
     */
    addTreeItem(name: string): void {
        this.refresh()

        setTimeout(() => {
            this.treeview?.reveal(this.sessionTypeNode, { expand: true })
            void this.getChildren(this.sessionTypeNode).then((nodes) => {
                const newSession = nodes.find((node) => node.label === name) as
                    | SessionInstanceTreeItem
                    | undefined
                if (newSession) {
                    this.treeview?.reveal(newSession, { focus: true })
                }
            })
        }, 200)
    }

    /**
     * Delete a tree item
     */
    deleteTreeItem(): void {
        this.refresh()
    }

    /**
     * Delete all tree items
     */
    deleteAllTreeItems(): void {
        this.refresh()
    }

    /**
     * Set active status for a session
     */
    setActiveStatus(name: string | undefined): void {
        this.activeSessionName = name
        this.refresh()
    }

    /**
     * Get children for tree view
     */
    getChildren(element?: TreeItemType): Thenable<TreeItemType[]> {
        // If no workspace is opened, return message and open folder option
        if (
            !vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0
        ) {
            return Promise.resolve([
                new SessionTypeTreeItem(
                    "You have not yet opened a folder.",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                ),
                new OpenFolderTreeItem(),
            ])
        }

        if (element) {
            // If element is the session type node, create items for each session
            if (element.contextValue === this.treeItemContextValue) {
                const sessions = this.storage.getSessionsByType()
                return Promise.resolve(
                    sessions.map((session) => {
                        const isActive = session.name === this.activeSessionName
                        const contextValue = isActive
                            ? this.activeInstanceContextValue
                            : this.instanceContextValue
                        return new SessionInstanceTreeItem(
                            session.name,
                            session.config,
                            contextValue,
                            this.commandId,
                        )
                    }),
                )
            }
            return Promise.resolve([
                new SessionTypeTreeItem(
                    "No saved sessions found",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                ),
            ])
        } else {
            // Root level - return the session type node
            const sessionCount = this.storage.getSessionCount()
            const collapsibleState =
                sessionCount > 0
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None
            this.sessionTypeNode.collapsibleState = collapsibleState
            return Promise.resolve([this.sessionTypeNode])
        }
    }

    /**
     * Get parent of a tree item
     */
    getParent(element: TreeItemType): vscode.ProviderResult<TreeItemType> {
        // If the element is a session instance, its parent is the session type node
        if (element instanceof SessionInstanceTreeItem) {
            return this.sessionTypeNode
        }
        // For root nodes or OpenFolder, return undefined (no parent)
        return undefined
    }

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire()
        this._onDidChangeTreeData.fire() // for now fires is required to update the tree view correctly, need to investigate why!
    }

    /**
     * Get the session type node
     */
    getSessionTypeNode(): SessionTypeTreeItem {
        return this.sessionTypeNode
    }
}
