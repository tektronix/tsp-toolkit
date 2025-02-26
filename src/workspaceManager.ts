import * as path from "path"
import { COMMAND_SETS } from "@tektronix/keithley_instrument_libraries"
import * as vscode from "vscode"

export async function updateConfiguration(
    config_name: string,
    value: unknown,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
    workspace_path?: vscode.WorkspaceFolder,
) {
    const config = workspace_path
        ? vscode.workspace.getConfiguration(undefined, workspace_path.uri)
        : vscode.workspace.getConfiguration()

    const currentConfiguration = config.get(config_name, {})
    const updatedConfiguration =
        typeof currentConfiguration === "object" &&
        !Array.isArray(currentConfiguration)
            ? { ...currentConfiguration, ...(value as object) }
            : value

    try {
        await config.update(config_name, updatedConfiguration, target)
        // DEBUG ONLY
        // if (notification) {
        //     void vscode.window.showInformationMessage(
        //         `${config_name} configuration updated successfully.`,
        //     )
        // }
    } catch {
        void vscode.window.showErrorMessage(
            `Failed to update ${config_name} configuration`,
        )
    }
}

export async function configure_initial_workspace_configurations() {
    await updateConfiguration(
        "files.associations",
        {
            "*.tsp": "lua",
        },
        vscode.ConfigurationTarget.Global,
    )
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders) {
        for (const folder of workspaceFolders) {
            await updateConfiguration(
                "Lua.workspace.ignoreDir",
                [],
                vscode.ConfigurationTarget.WorkspaceFolder,
                folder,
            )
            await updateConfiguration(
                "Lua.diagnostics.libraryFiles",
                "Disable",
                vscode.ConfigurationTarget.WorkspaceFolder,
                folder,
            )
            await updateConfiguration(
                "Lua.runtime.version",
                "Lua 5.1",
                vscode.ConfigurationTarget.WorkspaceFolder,
                folder,
            )
            await updateConfiguration(
                "Lua.runtime.builtin",
                {
                    basic: "disable",
                    bit: "disable",
                    bit32: "disable",
                    builtin: "disable",
                    coroutine: "disable",
                    debug: "disable",
                    ffi: "disable",
                    io: "disable",
                    jit: "disable",
                    "jit.profile": "disable",
                    "jit.util": "disable",
                    math: "disable",
                    os: "disable",
                    package: "disable",
                    string: "disable",
                    "string.buffer": "disable",
                    table: "disable",
                    "table.clear": "disable",
                    "table.new": "disable",
                    utf8: "disable",
                },
                vscode.ConfigurationTarget.WorkspaceFolder,
                folder,
            )
            await updateConfiguration(
                "Lua.workspace.library",
                [path.join(COMMAND_SETS, "tsp-lua-5.0")],
                vscode.ConfigurationTarget.WorkspaceFolder,
                folder,
            )
        }
    }
}
