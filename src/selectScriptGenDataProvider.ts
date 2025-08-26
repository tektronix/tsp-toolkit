import * as vscode from "vscode"
import { SavedScriptGenManager, tspScriptGen } from "./savedScriptGenManager"

export class selectScriptGenDataProvider
implements vscode.TreeDataProvider<SelectScriptGenInstance | openFolder>
{
    private _onDidChangeTreeData: vscode.EventEmitter<
        SelectScriptGenInstance | openFolder | undefined | void
    > = new vscode.EventEmitter<SelectScriptGenInstance | undefined | void>()

    readonly onDidChangeTreeData: vscode.Event<
        SelectScriptGenInstance | openFolder | undefined | void
    > = this._onDidChangeTreeData.event

    public _savedConfigs: tspScriptGen
    private treeview?: vscode.TreeView<SelectScriptGenInstance | openFolder>
    private ivCharNode: SelectScriptGenInstance
    public activeScriptName: string | undefined

    constructor() {
        this._savedConfigs = new SavedScriptGenManager().loadSavedConfigs() // load saved configurations from settings.json to populate I-V Characterization node
        this.ivCharNode = new SelectScriptGenInstance( //intialize the I-V Characterization node
            "I-V Characterization",
            vscode.TreeItemCollapsibleState.Expanded,
            "SavedIVCharTreeItem",
        )
    }

    // This method is used to set the tree view for the data provider
    setTreeView(
        treeview: vscode.TreeView<SelectScriptGenInstance | openFolder>,
    ) {
        this.treeview = treeview
    }

    getTreeItem(
        element: SelectScriptGenInstance | openFolder,
    ): vscode.TreeItem {
        return element
    }

    addTreeItem(element: string, config: string): void {
        this._savedConfigs["I-V Characterization"] =
            this._savedConfigs["I-V Characterization"] || []
        this._savedConfigs["I-V Characterization"].push({
            name: element,
            config: config,
        })

        this.refresh()

        setTimeout(() => {
            this.treeview?.reveal(this.ivCharNode, { expand: true })
            const scripts = this.getChildren(this.ivCharNode)
            scripts.then((nodes) => {
                const newScript = nodes.find(
                    (node) => node.label === element,
                ) as savedScriptGenInstance | undefined
                if (newScript) {
                    this.treeview?.reveal(newScript, { focus: true })
                }
            })
        }, 100)
    }

    //ToDo: Add way to kill cp if running script is being deleted
    deleteTreeItem(name: string): void {
        this._savedConfigs["I-V Characterization"] = this._savedConfigs[
            "I-V Characterization"
        ].filter((script) => script.name !== name)

        this.refresh()
    }

    setActiveStatus(name: string | undefined): void {
        this.activeScriptName = name
        this.refresh()
    }

    getChildren(
        element?: SelectScriptGenInstance | savedScriptGenInstance | openFolder,
    ): Thenable<
        SelectScriptGenInstance[] | savedScriptGenInstance[] | openFolder[]
    > {
        // If no workspace is opened, return a message to open a folder and add open folder option
        if (
            !vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0
        ) {
            return Promise.resolve([
                new SelectScriptGenInstance(
                    "You have not yet opened a folder.",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                ),
                new openFolder(),
            ])
        }

        if (element) {
            //if element is SavedIVCharTreeItem, create tree item for each saved script generation instance
            if (element.contextValue === "SavedIVCharTreeItem") {
                const configs = this._savedConfigs["I-V Characterization"] ?? []
                return Promise.resolve(
                    configs.map((config) => {
                        const isActive = config.name === this.activeScriptName
                        const item = new savedScriptGenInstance(
                            config.name,
                            config.config,
                            isActive
                                ? "ActiveSavedIVCharInstance"
                                : "SavedIVCharInstance",
                        )
                        return item
                    }),
                )
            }
            return Promise.resolve([
                new SelectScriptGenInstance(
                    "No saved configurations found",
                    vscode.TreeItemCollapsibleState.None,
                    "",
                ),
            ])
        } else {
            const collapsibleState =
                (this._savedConfigs["I-V Characterization"]?.length ?? 0) > 0
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None
            this.ivCharNode.collapsibleState = collapsibleState
            return Promise.resolve([this.ivCharNode])
        }
    }

    getParent(
        element: SelectScriptGenInstance | openFolder,
    ): vscode.ProviderResult<SelectScriptGenInstance | openFolder> {
        // If the element is a saved script instance, its parent is the I-V Characterization node
        if (element instanceof savedScriptGenInstance) {
            return this.ivCharNode
        }
        // For root nodes or openFolder, return undefined (no parent)
        return undefined
    }

    refresh(): void {
        this._onDidChangeTreeData.fire()
    }
}

export class SelectScriptGenInstance extends vscode.TreeItem {
    public active: boolean = false
    constructor(
        public readonly label: string,
        public collapsible: vscode.TreeItemCollapsibleState = vscode
            .TreeItemCollapsibleState.None,
        public contextValue: string = "",
        public command?: vscode.Command,
    ) {
        super(label, collapsible)
    }
}

class openFolder extends vscode.TreeItem {
    constructor() {
        super("Open Folder", vscode.TreeItemCollapsibleState.None)
        this.command = {
            command: "workbench.action.files.openFolder",
            title: "Open Folder",
        }
        this.iconPath = new vscode.ThemeIcon("folder-opened")
    }
}

export class savedScriptGenInstance extends SelectScriptGenInstance {
    constructor(
        private name: string,
        private config: string = "",
        public contextValue: string = "SavedIVCharInstance",
    ) {
        super(name, vscode.TreeItemCollapsibleState.None)
        this.contextValue = contextValue
        this.command = {
            title: "Open Script gen",
            command: "tsp.viewScriptGenUI",
            arguments: [this],
        }
    }
}
