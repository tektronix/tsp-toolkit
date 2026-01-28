/* eslint-disable indent */
// import * as path from "path"
import * as vscode from "vscode"
import {
    DebugAdapterDescriptorFactory,
    DebugConfiguration,
    ProviderResult,
    WorkspaceFolder,
} from "vscode"
import { DebugHelper } from "./resourceManager"
import { TspDebugSession } from "./tspDebug"
import { Log } from "./logging"
import { getActiveConnection, pickConnection } from "./extension"
import { Connection } from "./connection"

export function activateTspDebug(
    context: vscode.ExtensionContext,
    factory?: vscode.DebugAdapterDescriptorFactory,
) {
    // play  button clicked

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "tspdebug.debugContent",
            async (resource: vscode.Uri) => {
                const LOGLOC = {
                    file: "activateTspDebug.ts",
                    func: "CMD:tspdebug.debugContent()",
                }

                // Determine target resource
                let targetResource = resource
                if (!targetResource && vscode.window.activeTextEditor) {
                    targetResource = vscode.window.activeTextEditor.document.uri
                }

                if (!targetResource) {
                    vscode.window.showErrorMessage(
                        "No file to debug. Please open a TSP file.",
                    )
                    Log.error("No target resource found for debugging", LOGLOC)
                    return
                }

                // Get connection
                const conn = await get_connection()
                if (!conn) {
                    Log.error("No connection available for debugging", LOGLOC)
                    return
                }
                await conn.exitConnection()

                // Set up debug helper
                DebugHelper.debuggeeFilePath = targetResource.fsPath
                DebugHelper.connection = conn

                try {
                    const started = await vscode.debug.startDebugging(
                        undefined,
                        {
                            type: "tspdebug",
                            name: "Debug TSP File",
                            request: "launch",
                            program: targetResource.fsPath,
                        },
                    )

                    if (started) {
                        await vscode.commands.executeCommand(
                            "workbench.panel.repl.view.focus",
                        )
                        Log.debug("Debugger started successfully", LOGLOC)
                    } else {
                        vscode.window.showErrorMessage(
                            "Failed to start debugger.",
                        )
                        Log.error(
                            "Debugger failed to start (returned false)",
                            LOGLOC,
                        )
                    }
                } catch (error) {
                    const errorMsg =
                        error instanceof Error ? error.message : String(error)
                    vscode.window.showErrorMessage(
                        `Unable to start debugger: ${errorMsg}`,
                    )
                    Log.error(`Unable to start debugger: ${errorMsg}`, LOGLOC)
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
        factory = new InlineDebugAdapterFactory()
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
    constructor() {}

    createDebugAdapterDescriptor(): Promise<
        vscode.DebugAdapterDescriptor | undefined
    > {
        if (!DebugHelper.connection) {
            return Promise.reject(new Error("No connection available"))
        }
        return Promise.resolve(
            new vscode.DebugAdapterInlineImplementation(
                new TspDebugSession(DebugHelper.connection),
            ),
        )
    }
}

async function get_connection(): Promise<Connection | undefined> {
    return (await getActiveConnection()) || (await pickConnection())
}
