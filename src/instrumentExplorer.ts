import * as child from "child_process"
import { join } from "path"
import * as vscode from "vscode"
import { InactiveInstrumentList, Instrument } from "./instrument"
import { Connection } from "./connection"
import { InstrumentProvider } from "./instrumentProvider"
import { Log, SourceLocation } from "./logging"
import { DISCOVER_EXECUTABLE } from "./kic-cli"
import { LOG_DIR } from "./utility"
import { ConnectionHelper } from "./resourceManager"

const DISCOVERY_TIMEOUT = 5

export class InstrumentsExplorer implements vscode.Disposable {
    private InstrumentsDiscoveryViewer: vscode.TreeView<
        Instrument | Connection | InactiveInstrumentList
    >
    private treeDataProvider?: InstrumentProvider
    private intervalID?: NodeJS.Timeout
    //private _kicProcessMgr: KicProcessMgr
    private _discoveryInProgress: boolean = false
    private statusBarItem: vscode.StatusBarItem

    constructor(
        context: vscode.ExtensionContext,
        //  kicProcessMgr: KicProcessMgr,
    ) {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentExplorer.constructor()",
        }
        //   this._kicProcessMgr = kicProcessMgr

        Log.trace("Instantiating TDP", LOGLOC)
        const treeDataProvider = InstrumentProvider.instance
        Log.trace("Refreshing TDP", LOGLOC)

        this.InstrumentsDiscoveryViewer = vscode.window.createTreeView<
            Instrument | Connection | InactiveInstrumentList
        >("InstrumentsExplorer", {
            treeDataProvider,
        })

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        )
        context.subscriptions.push(this.statusBarItem)

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.statusBarItem.text = "Checking saved instrument connections..."
            this.statusBarItem.show()
            this.treeDataProvider
                ?.refresh(async () => {
                    await this.startDiscovery()
                })
                .then(
                    () => {
                        this.statusBarItem.hide()
                    },
                    (e) => {
                        this.statusBarItem.hide()
                        Log.error(`Unable to refresh instrument explorer: ${e}`)
                    },
                )
        })
        vscode.commands.registerCommand(
            "InstrumentsExplorer.openInstrumentsDiscoveryResource",
            () => void 0,
        )
        vscode.commands.registerCommand(
            "InstrumentsExplorer.revealResource",
            () => void 0,
        )

        const saveInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.save",
            async (e: Instrument) => {
                await this.saveInstrument(e)
            },
        )

        const removeInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.remove",
            async (e: Instrument) => {
                await this.removeInstrument(e)
            },
        )

        const changeIPAddr = vscode.commands.registerCommand(
            "InstrumentsExplorer.updateIPAddr",
            async (e: Connection) => {
                await this.updateIPAddr(e)
            },
        )

        context.subscriptions.push(saveInstrument)
        context.subscriptions.push(removeInstrument)
        context.subscriptions.push(changeIPAddr)

        this.statusBarItem.text = "Checking saved instrument connections..."
        this.statusBarItem.show()

        this.treeDataProvider
            ?.refresh(async () => await this.startDiscovery())
            .then(
                () => {
                    this.statusBarItem.hide()
                },
                (e: Error) => {
                    this.statusBarItem.hide()
                    Log.error(`Unable to start Discovery ${e.message}`, LOGLOC)
                },
            )
    }
    dispose() {
        this.treeDataProvider?.dispose()
        this.statusBarItem.dispose()
    }

    private startDiscovery(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentExplorer.startDiscovery()",
        }
        return new Promise<void>((resolve) => {
            if (!this._discoveryInProgress) {
                this.statusBarItem.text = "Discovering"
                this.statusBarItem.tooltip =
                    "Discovering new instrument connections..."
                this.statusBarItem.show()

                this._discoveryInProgress = true
                const discover = child.spawn(
                    DISCOVER_EXECUTABLE,
                    [
                        "--log-file",
                        join(
                            LOG_DIR,
                            `${new Date()
                                .toISOString()
                                .substring(0, 10)}-kic-discover.log`,
                        ),
                        "all",
                        "--timeout",
                        DISCOVERY_TIMEOUT.toString(),
                        "--exit",
                    ],
                    //,
                    // {
                    //     detached: true,
                    //     stdio: "ignore",
                    // }
                )

                discover.on("exit", (code) => {
                    if (code) {
                        Log.trace(`Discover Exit Code: ${code}`, LOGLOC)
                    }
                    this.statusBarItem.hide()
                    clearInterval(this.intervalID)
                    this._discoveryInProgress = false
                    resolve()
                })

                //subprocess.unref()

                //this.treeDataProvider?.clear()

                this.intervalID = setInterval(() => {
                    this.treeDataProvider?.getContent().then(
                        () => { },
                        () => { },
                    )
                }, 1000)
            }
        })
    }

    public async rename(item: Instrument) {
        //if (typeof item === typeof InstrDiscoveryNode) {
        const name = await vscode.window.showInputBox({
            placeHolder: "Enter new name",
        })
        if (
            name !== null &&
            name !== undefined &&
            name.length > 0 &&
            item !== undefined
        ) {
            Log.trace(`Changing name from ${item.name} to ${name}`, {
                file: "instruments.ts",
                func: "InstrumentsExplorer.rename()",
            })
            item.name = name
            this.treeDataProvider?.doWithConfigWatcherOff(() => {
                this.treeDataProvider?.updateSaved(item).catch(() => { })
            })
        } else {
            Log.warn("Item not defined", {
                file: "instruments.ts",
                func: "InstrumentsExplorer.rename()",
            })
        }
    }

    public async updateIPAddr(item: Connection) {
        const newIP = await vscode.window.showInputBox({
            placeHolder: "Enter new IP address or VISA resource string",
            prompt: "Enter a valid IPv4 address or VISA resource string",
        })

        if (!newIP || newIP.trim().length === 0) {
            vscode.window.showErrorMessage("IP address update cancelled or empty")
            Log.warn("IP address update cancelled or empty", {
                file: "instruments.ts",
                func: "InstrumentsExplorer.changeIP()",
            })
            return
        }

        if (!item || !item.parent) {
            vscode.window.showErrorMessage("Connection not defined")
            Log.warn("Connection not defined", {
                file: "instruments.ts",
                func: "InstrumentsExplorer.changeIP()",
            })
            return
        }

        const trimmedIP = newIP.trim()
        const validationError = ConnectionHelper.instrConnectionStringValidator(trimmedIP)
        if (validationError) {
            vscode.window.showErrorMessage("Invalid IP address or VISA resource string")
            Log.warn(`Invalid IP address: ${validationError}`, {
                file: "instruments.ts",
                func: "InstrumentsExplorer.changeIP()",
            })
            return
        }

        Log.trace(`Changing IP from ${item.addr} to ${trimmedIP}`, {
            file: "instruments.ts",
            func: "InstrumentsExplorer.changeIP()",
        })
        const oldIP = item.addr
        item.addr = trimmedIP
        this.treeDataProvider?.addOrUpdateInstrument(item.parent)
        this.treeDataProvider?.doWithConfigWatcherOff(() => {
            this.treeDataProvider?.updateSaved(item.parent!).catch(() => { })
        })
        Log.info(`IP address updated from ${oldIP} to ${trimmedIP} for ${item.parent.name}`, {
            file: "instruments.ts",
            func: "InstrumentsExplorer.changeIP()",
        })
        vscode.window.showInformationMessage(`IP address updated to ${trimmedIP}`)
    }

    public async saveWhileConnect(instrument: Instrument) {
        await this.treeDataProvider?.saveInstrument(instrument)
    }

    private async saveInstrument(instr: Instrument) {
        await this.treeDataProvider?.saveInstrument(instr)
    }

    //from connect

    private async removeInstrument(instr: Instrument) {
        instr.saved = false
        await this.treeDataProvider?.removeInstrument(instr)
    }
}
