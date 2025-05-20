import { join } from "path"
import * as fs from "fs"
import { COMMAND_SETS } from "@tektronix/keithley_instrument_libraries"
import * as vscode from "vscode"
import { SystemInfo } from "./resourceManager"
import { Log } from "./logging"
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

    if (vscode.workspace.workspaceFolders) {
        //increasing Lua.workspace.preloadFileSize to 2000KB,
        //to handle the increasing file size of lua defination file
        await updateConfiguration(
            "Lua.workspace.preloadFileSize",
            2000,
            vscode.ConfigurationTarget.Workspace,
        )
        await updateConfiguration(
            "Lua.workspace.ignoreDir",
            [],
            vscode.ConfigurationTarget.Workspace,
        )
        await updateConfiguration(
            "Lua.diagnostics.libraryFiles",
            "Disable",
            vscode.ConfigurationTarget.Workspace,
        )
        await updateConfiguration(
            "Lua.runtime.version",
            "Lua 5.1",
            vscode.ConfigurationTarget.Workspace,
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
            vscode.ConfigurationTarget.Workspace,
        )
        await updateLuaLibraryConfigurations()
    }
}

/**
 * Updates the workspace Lua library configurations based on system information and active nodes.
 *
 * This function:
 * - Manages a folder that stores generated Lua node definitions.
 * - Retrieves system configuration details (local and remote nodes).
 * - Creates custom Lua file definitions for specific nodes.
 * - Dynamically updates the "Lua.workspace.library" settings with the new paths.
 *
 * @async
 * @returns {Promise<void>} A promise that resolves when the configuration update is complete.
 */
export async function updateLuaLibraryConfigurations(): Promise<void> {
    try {
        await updateConfiguration(
            "Lua.workspace.library",
            [],
            vscode.ConfigurationTarget.Workspace,
        )
        const newLibrarySettings: string[] = []
        newLibrarySettings.push(join(COMMAND_SETS, "tsp-lua-5.0"))

        const luaDefinitionsFolderPath = join(COMMAND_SETS, "nodes_definitions")
        if (fs.existsSync(luaDefinitionsFolderPath)) {
            fs.rmSync(luaDefinitionsFolderPath, {
                recursive: true,
                force: true,
            })
        }
        fs.mkdirSync(luaDefinitionsFolderPath, { recursive: true })

        const systemInfo: SystemInfo[] =
            vscode.workspace
                .getConfiguration("tsp")
                .get("tspLinkSystemConfigurations") ?? []
        const activeSystem = systemInfo.find((item) => item.isActive)

        const nodeDetails: Record<string, string[]> = {}

        createCommonNodeSlotTables(luaDefinitionsFolderPath, "---@meta\n")
        if (activeSystem?.localNode) {
            nodeDetails[activeSystem.localNode] = ["localNode"]
        }

        const slotDetails: Record<string, string[]> = {}

        if (activeSystem?.slots) {
            // Collect slot IDs for the table
            const slotIds: string[] = []
            for (const slot of activeSystem.slots) {
                if (!slot.module.includes("Empty")) {
                    if (!slotDetails[slot.module]) {
                        slotDetails[slot.module] = []
                    }
                    slotDetails[slot.module].push(slot.slotId)
                    slotIds.push(
                        `[${slot.slotId.split("[")[1]} = ${slot.slotId}`,
                    )
                    createCommonNodeSlotTables(
                        luaDefinitionsFolderPath,
                        `---${slot.module}\n---@type table\n${slot.slotId}={}\n`,
                    )
                }
            }

            const slotsTable = `slot = {${slotIds.join(", ")}}`
            createCommonNodeSlotTables(luaDefinitionsFolderPath, slotsTable)
        }

        if (activeSystem?.nodes) {
            const nodeIds: string[] = []
            for (const node of activeSystem.nodes) {
                if (!nodeDetails[node.mainframe]) {
                    nodeDetails[node.mainframe] = []
                }
                nodeDetails[node.mainframe].push(node.nodeId)

                nodeIds.push(`[${node.nodeId.split("[")[1]} = ${node.nodeId}`)
                if (node?.slots) {
                    // Collect slot IDs for the table
                    const slotIds: string[] = []
                    for (const slot of node.slots) {
                        if (!slot.module.includes("Empty")) {
                            if (!slotDetails[slot.module]) {
                                slotDetails[slot.module] = []
                            }
                            slotDetails[slot.module].push(
                                node.nodeId + slot.slotId,
                            )
                            slotIds.push(
                                `[${slot.slotId.split("[")[1]} = ${node.nodeId}.${slot.slotId}`,
                            )
                            createCommonNodeSlotTables(
                                luaDefinitionsFolderPath,
                                `---${slot.module}\n---@type table\n${node.nodeId}.${slot.slotId}={}`,
                            )
                        }
                    }
                    const slotsTable = `${node.nodeId}.slot = {${slotIds.join(", ")}}`
                    createCommonNodeSlotTables(
                        luaDefinitionsFolderPath,
                        slotsTable,
                    )
                }
            }
            const nodeTable = `node = {${nodeIds.join(", ")}}`
            createCommonNodeSlotTables(luaDefinitionsFolderPath, nodeTable)
        }

        for (const [model, nodes] of Object.entries(nodeDetails)) {
            const libBasePath = join(COMMAND_SETS, model.toUpperCase())
            newLibrarySettings.push(join(libBasePath, "Helper"))

            if (nodes.some((str) => str.includes("localNode"))) {
                newLibrarySettings.push(join(libBasePath, "AllTspCommands"))
            }

            for (const node of nodes) {
                if (node.includes("node")) {
                    const nodeNum = parseInt(node.match(/\d+/)?.[0] || "", 10)
                    createNodeCmdFile(
                        libBasePath,
                        nodeNum,
                        luaDefinitionsFolderPath,
                        model,
                    )
                }
            }
        }

        for (const [model, slots] of Object.entries(slotDetails)) {
            const libBasePath = join(COMMAND_SETS, model.toUpperCase())
            newLibrarySettings.push(join(libBasePath, "Helper"))

            if (slots.some((str) => str.includes("localNode"))) {
                newLibrarySettings.push(join(libBasePath, "AllTspCommands"))
            }

            for (const slotId of slots) {
                if (slotId.includes("node[") && slotId.includes("slot[")) {
                    const nodeMatch = slotId.match(/node\[(\d+)\]/)
                    const slotMatch = slotId.match(/slot\[(\d+)\]/)
                    const nodeNum = nodeMatch ? parseInt(nodeMatch[1], 10) : 0
                    const slotNum = slotMatch ? parseInt(slotMatch[1], 10) : 0
                    createNodeSlotCmdFile(
                        libBasePath,
                        nodeNum,
                        slotNum,
                        luaDefinitionsFolderPath,
                        model,
                    )
                } else if (slotId.includes("slot[")) {
                    const slotNum = parseInt(slotId.match(/\d+/)?.[0] || "", 10)
                    createSlotCmdFile(
                        libBasePath,
                        slotNum,
                        luaDefinitionsFolderPath,
                        model,
                    )
                } else {
                    /* empty */
                }
            }
        }

        // Add luaDefinitionsFolderPath to library settings if it contains files
        if (fs.readdirSync(luaDefinitionsFolderPath).length !== 0) {
            newLibrarySettings.push(luaDefinitionsFolderPath)
        }

        // Wait for a few seconds before updating the configuration
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await updateConfiguration(
            "Lua.workspace.library",
            newLibrarySettings,
            vscode.ConfigurationTarget.Workspace,
        )
    } catch (error) {
        Log.error(
            `Error updating Lua library configurations: ${String(error)}`,
            {
                file: "extension.ts",
                func: "updateLuaLibraryConfigurations()",
            },
        )
    }
}

function createNodeCmdFile(
    libBasePath: string,
    nodeNum: number,
    luaDefinitionsFolderPath: string,
    model: string,
) {
    const nodeCmdFilePath = join(
        libBasePath,
        "tspLinkSupportedCommands",
        "definitions.txt",
    )
    const nodeCmdFileContent = fs
        .readFileSync(nodeCmdFilePath, "utf8")
        .replace(/\$node_number\$/g, nodeNum.toString())
    const newNodeCmdFilePath = join(
        luaDefinitionsFolderPath,
        `${model}_node${nodeNum}.lua`,
    )
    fs.writeFileSync(newNodeCmdFilePath, nodeCmdFileContent)
}

function createSlotCmdFile(
    libBasePath: string,
    slotNum: number,
    luaDefinitionsFolderPath: string,
    model: string,
) {
    const slotCmdFilePath = join(
        libBasePath,
        "AllTspCommands",
        "definitions.lua",
    )
    const nodeCmdFileContent = fs
        .readFileSync(slotCmdFilePath, "utf8")
        .replace(/\$slot_number\$/g, slotNum.toString())
    const newNodeCmdFilePath = join(
        luaDefinitionsFolderPath,
        `${model}_slot${slotNum}.lua`,
    )
    fs.writeFileSync(newNodeCmdFilePath, nodeCmdFileContent)
}

function createNodeSlotCmdFile(
    libBasePath: string,
    nodeNum: number,
    slotNum: number,
    luaDefinitionsFolderPath: string,
    model: string,
) {
    const nodeSlotCmdFilePath = join(
        libBasePath,
        "tspLinkSupportedCommands",
        "definitions.txt",
    )
    const nodeCmdFileContent = fs
        .readFileSync(nodeSlotCmdFilePath, "utf8")
        .replace(/\$node_number\$/g, nodeNum.toString())
        .replace(/\$slot_number\$/g, slotNum.toString())
    const newNodeCmdFilePath = join(
        luaDefinitionsFolderPath,
        `${model}_node${nodeNum}_slot${slotNum}.lua`,
    )
    fs.writeFileSync(newNodeCmdFilePath, nodeCmdFileContent)
}

function createCommonNodeSlotTables(
    luaDefinitionsFolderPath: string,
    contains: string,
) {
    const newNodeCmdFilePath = join(
        luaDefinitionsFolderPath,
        "commonTables.lua",
    )
    fs.writeFileSync(newNodeCmdFilePath, `\n${contains}`, { flag: "a" })
}
