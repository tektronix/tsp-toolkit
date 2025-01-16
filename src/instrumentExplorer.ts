import * as child from "child_process"
import { join } from "path"
import * as vscode from "vscode"
import { InactiveInstrumentList, Instrument } from "./instrument"
import { Connection } from "./connection"
import { InstrumentProvider } from "./instrumentProvider"
import { Log, SourceLocation } from "./logging"
import { DISCOVER_EXECUTABLE } from "./kic-cli"
import { LOG_DIR } from "./utility"

const DISCOVERY_TIMEOUT = 2

export class InstrumentsExplorer implements vscode.Disposable {
    private InstrumentsDiscoveryViewer: vscode.TreeView<
        Instrument | Connection | InactiveInstrumentList
    >
    private treeDataProvider?: InstrumentProvider
    private intervalID?: NodeJS.Timeout
    //private _kicProcessMgr: KicProcessMgr
    private _discoveryInProgress: boolean = false

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
        treeDataProvider
            .refresh(async () => await this.startDiscovery())
            .catch((e) => {
                Log.error(
                    `Problem starting Instrument List data provider: ${e}`,
                    LOGLOC,
                )
            })

        this.InstrumentsDiscoveryViewer = vscode.window.createTreeView<
            Instrument | Connection | InactiveInstrumentList
        >("InstrumentsExplorer", {
            treeDataProvider,
        })

        this.InstrumentsDiscoveryViewer.message =
            "Checking saved instrument connections..."

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.InstrumentsDiscoveryViewer.message =
                "Checking saved instrument connections..."
            this.treeDataProvider
                ?.refresh(async () => {
                    await this.startDiscovery()
                })
                .then(
                    () => {},
                    (e) => {
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

        context.subscriptions.push(saveInstrument)
        context.subscriptions.push(removeInstrument)

        this.treeDataProvider
            ?.refresh(async () => await this.startDiscovery())
            .then(
                () => {},
                (e: Error) => {
                    Log.error(`Unable to start Discovery ${e.message}`, LOGLOC)
                },
            )
    }
    dispose() {
        this.treeDataProvider?.dispose()
    }

    private startDiscovery(): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: "InstrumentExplorer.startDiscovery()",
        }
        return new Promise<void>((resolve) => {
            if (!this._discoveryInProgress) {
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
                    this.InstrumentsDiscoveryViewer.message = ""
                    clearInterval(this.intervalID)
                    this._discoveryInProgress = false
                    resolve()
                })

                //subprocess.unref()

                this.InstrumentsDiscoveryViewer.message =
                    "Discovering new instrument connections..."

                //this.treeDataProvider?.clear()

                this.intervalID = setInterval(() => {
                    this.treeDataProvider?.getContent().then(
                        () => {},
                        () => {},
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
            this.treeDataProvider?.addOrUpdateInstrument(item)
            this.treeDataProvider?.doWithConfigWatcherOff(() => {
                this.treeDataProvider?.updateSaved(item).catch(() => {})
            })
        } else {
            Log.warn("Item not defined", {
                file: "instruments.ts",
                func: "InstrumentsExplorer.rename()",
            })
        }
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
