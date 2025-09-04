/* eslint-disable indent */
// import * as path from "path"
import * as vscode from "vscode"
import {
    DebugAdapterDescriptorFactory,
    DebugConfiguration,
    ProviderResult,
    WorkspaceFolder,
} from "vscode"
import { ConnectionDetails, DebugHelper } from "./resourceManager"
import { TspDebugSession } from "./tspDebug"
import { CommunicationManager } from "./communicationmanager"
import { Log } from "./logging"
import { TspToolkitApi } from "./utility"

export function activateTspDebug(
    context: vscode.ExtensionContext,
    acm: CommunicationManager,
    factory?: vscode.DebugAdapterDescriptorFactory,
) {
    // play  button clicked

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "tspdebug.debugContent",
            (resource: vscode.Uri) => {
                const LOGLOC = {
                    file: "activateTspDebug.ts",
                    func: "CMD:tspdebug.debugContent()",
                }
                let targetResource = resource

                if (!targetResource && vscode.window.activeTextEditor) {
                    targetResource = vscode.window.activeTextEditor.document.uri
                }

                if (targetResource) {
                    const dbg = vscode.debug.startDebugging(undefined, {
                        type: "tspdebug",
                        name: "Debug TSP File",
                        request: "launch",
                        program: targetResource.fsPath,
                    })
                    dbg.then(
                        () => {
                            vscode.commands.executeCommand(
                                "workbench.panel.repl.view.focus",
                            )
                            Log.debug("Debugger started", LOGLOC)
                        },
                        () => Log.error("Unable to start debugger", LOGLOC),
                    )
                }
            },
        ),
    )

    // register a configuration provider for 'tspdebug' debug type

    const provider = new TspConfigurationProvider()
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider("tspdebug", provider),
    )

    // register a dynamic configuration provider for 'tspdebug' debug type
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(
            "tspdebug",
            {
                provideDebugConfigurations(): ProviderResult<
                    DebugConfiguration[]
                > {
                    return [
                        {
                            name: "Debug TSP File: Dynamic Launch",
                            request: "launch",
                            type: "tspdebug",
                            program: "${file}",
                        },
                    ]
                },
            },
            vscode.DebugConfigurationProviderTriggerKind.Dynamic,
        ),
    )

    if (!factory) {
        factory = new InlineDebugAdapterFactory(acm)
    }

    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory("tspdebug", factory),
    )
    if ("dispose" in factory) {
        context.subscriptions.push(factory as vscode.Disposable)
    }
}

class TspConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Message a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(
        _folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        //_token?: CancellationToken
    ): ProviderResult<DebugConfiguration> {
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            const editor = vscode.window.activeTextEditor
            //removed language check here and added file extension check in debugger_pre_check() method
            if (editor) {
                config.type = "tspdebug"
                config.name = "Launch"
                config.request = "launch"
                config.program = "${file}"
                config.trace = false
            }
        }

        if (!config.program) {
            return vscode.window
                .showInformationMessage("Cannot find program to debug.")
                .then(() => {
                    return undefined // abort launch
                })
        }

        return config
    }
}

class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
    private _acm: CommunicationManager
    constructor(acm: CommunicationManager) {
        this._acm = acm
    }

    async createDebugAdapterDescriptor(): Promise<
        vscode.DebugAdapterDescriptor | undefined
    > {
        /**
         * debugTermPid stores the terminalPid of connection currently selected
         * by user for debugging
         */

        let start_dbg = false

        await this.debugger_pre_check().then(
            () => {
                start_dbg = true
            },
            (rej) => {
                return Promise.reject(new Error(new String(rej).toString()))
            },
        )

        if (start_dbg) {
            return new vscode.DebugAdapterInlineImplementation(
                new TspDebugSession(
                    this._acm.InstrDetails,
                    this._acm.doReconnect,
                ),
            )
        }
        // return new vscode.DebugAdapterInlineImplementation(
        //     new TspDebugSession(this._acm.InstrDetails, this._acm.doReconnect)
        // )
    }

    async debugger_pre_check(): Promise<string> {
        const dbg_file = vscode.window.activeTextEditor?.document.uri.fsPath
        const file_extn = dbg_file?.split(".").pop()

        if (file_extn !== "tsp")
            return Promise.reject(new Error(".tsp file type required"))

        DebugHelper.debuggeeFilePath =
            vscode.window.activeTextEditor?.document.uri.fsPath

        let kicTerminals: vscode.Terminal[] = []
        const baseExt = vscode.extensions.getExtension("tektronix.tsp-toolkit")
        if (baseExt !== undefined) {
            const importedApi = baseExt.exports as TspToolkitApi

            kicTerminals = importedApi.fetchKicTerminals()

            Log.trace(`Found terminals: ${JSON.stringify(kicTerminals)}`, {
                file: "activateTspDebug.ts",
                func: "InlineDebugAdapterFactory.debugger_pre_check()",
            })

            /**
             * Provide option to user to select from existing connecton(s) or
             * be able to inistiate a new connection if none exist and
             * continue with debugging
             */

            if (kicTerminals.length === 0) {
                const options: vscode.InputBoxOptions = {
                    prompt: "No instrument found, do you want to connect?",
                    value: "Yes",
                }
                const res = await vscode.window.showInputBox(options)
                if (res?.toUpperCase() == "YES") {
                    let doConnect = true
                    await this._acm.connDetailsForFirstInstr().then(
                        () => {
                            //on success
                        },
                        () => {
                            //on failure
                            // void vscode.window.showInformationMessage(
                            //     "Connection unsuccessful. Cannot launch debug"
                            // )
                            doConnect = false
                        },
                    )
                    if (!doConnect)
                        return Promise.reject(
                            new Error(
                                "Connection unsuccessful. Cannot launch debug",
                            ),
                        )
                } else {
                    return Promise.reject(new Error("Invalid selection"))
                }
            } else if (kicTerminals.length == 1) {
                this._acm.doReconnect = true
                let kic_exit = false

                try {
                    const details = await importedApi.fetchConnDetails(
                        kicTerminals[0]?.processId,
                    )
                    kicTerminals[0]?.sendText(".exit\n")
                    await new Promise<void>((res) =>
                        vscode.window.onDidCloseTerminal((t) => {
                            if (t === kicTerminals[0]) {
                                res()
                            }
                        }),
                    )

                    this._acm.InstrDetails = details
                    kic_exit = true
                } catch (rej) {
                    void vscode.window.showInformationMessage(rej as string)
                }

                importedApi.fetchConnDetails(kicTerminals[0].processId).then(
                    async (res: ConnectionDetails | undefined) => {
                        if (res) {
                            kicTerminals[0].sendText(".exit\n")
                            await new Promise<void>((res) =>
                                vscode.window.onDidCloseTerminal((t) => {
                                    if (t === kicTerminals[0]) {
                                        res()
                                    }
                                }),
                            )
                            this._acm.InstrDetails = res
                            kic_exit = true
                        }
                    },
                    (rej: unknown) => {
                        void vscode.window.showInformationMessage(rej as string)
                    },
                )

                if (!kic_exit) return Promise.reject(new Error("error_flow"))
            } else if (kicTerminals.length > 1) {
                const options: vscode.InputBoxOptions = {
                    prompt: "Multiple instruments are connected!,\nPress enter to see all the active connections and select one from that",
                    value: "Ok",
                }
                const kicDict: { [name: string]: vscode.Terminal } = {}

                kicTerminals.forEach((t) => {
                    const k: string =
                        t.name +
                        ":" +
                        (
                            (t.creationOptions as vscode.TerminalOptions)
                                ?.shellArgs as string[]
                        )[1]
                    kicDict[k] = t
                })
                if ((await vscode.window.showInputBox(options)) != undefined) {
                    const selectedTerm = await vscode.window.showQuickPick(
                        Object.keys(kicDict),
                    )
                    if (selectedTerm != undefined) {
                        this._acm.doReconnect = true
                        let kic_exit = false

                        try {
                            const details = await importedApi.fetchConnDetails(
                                kicDict[selectedTerm]?.processId,
                            )
                            kicDict[selectedTerm]?.sendText(".exit\n")
                            await new Promise<void>((res) =>
                                vscode.window.onDidCloseTerminal((t) => {
                                    if (t === kicDict[selectedTerm]) {
                                        res()
                                    }
                                }),
                            )

                            this._acm.InstrDetails = details
                            kic_exit = true
                        } catch (rej) {
                            void vscode.window.showInformationMessage(
                                rej as string,
                            )
                        }

                        if (!kic_exit)
                            return Promise.reject(new Error("error_flow"))
                    } else return Promise.reject(new Error("Invalid selection"))
                } else return Promise.reject(new Error("Invalid selection"))
            }
            return Promise.resolve("non-error_flow")
        } else {
            return Promise.reject(
                new Error(
                    "tektronix.tsp-toolkit extension is required to start debugger.",
                ),
            )
        }
    }
}
