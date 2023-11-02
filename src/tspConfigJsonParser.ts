import * as fs from "fs"
import * as vscode from "vscode"

interface Slot {
    [slotNumber: string]: string
}

interface Node {
    model: string
    slots?: Slot
}

interface Nodes {
    [nodeName: string]: Node
}

interface JsonData {
    nodes: Nodes
    self?: string
}

/**
 * Get the Config.tsp.json file path and parser it
 * @param filePath Json file path
 * @returns Configured nodes details
 */
export function getNodeDetails(filePath: string): Record<string, string[]> {
    const json: string = fs.readFileSync(filePath, "utf8")
    const data: JsonData = JSON.parse(json) as JsonData
    const output: Record<string, string[]> = {}

    if (data.nodes) {
        Object.entries(data.nodes).forEach(([nodeName, nodeData]) => {
            const model = nodeData.model
            const slots = nodeData.slots || {}

            if (model in output) {
                output[model].push(nodeName)
            } else {
                output[model] = [nodeName]
            }

            Object.entries(slots).forEach(([slotNumber, slotModel]) => {
                const slotKey = `${nodeName}.${slotNumber}`

                if (slotModel in output) {
                    output[slotModel].push(slotKey)
                } else {
                    output[slotModel] = [slotKey]
                }
            })
        })
    }

    if (data.self) {
        if (data.self in output) {
            output[data.self].push("self")
        } else {
            output[data.self] = ["self"]
        }
    }

    return output
}

/**
 * Update node details in provide lua file
 * @param file_path file path
 * @param node_details node details
 */
export function updateNodeDetails(
    file_path: string,
    node_details: string
): void {
    // Read the file content
    // Write the updated content back to the file
    fs.writeFileSync(file_path, node_details, "utf-8")
    console.log("File updated successfully.")
}

export function getClassName(file_path: string): string {
    // Read the file content
    const content = fs.readFileSync(file_path, "utf-8")
    const regex = /---@class\s+(.+)/
    const match = content.match(regex)
    let className = ""
    if (match && match.length > 1) {
        className = match[1]
    }
    return className
}
/**
 * @param list1 list1
 * @param list2 list2
 * @returns return true if both the last are same
 */
export function compareLists<T>(list1: T[], list2: T[]): boolean {
    if (list1.length !== list2.length) {
        return false
    }
    return list1.every((item, index) => item === list2[index])
}
/**
 * update the library settings in workspace settings.json file
 * @param workspace_path workspace path
 * @param new_library_settings array of settings
 */
export function setLuaWorkspaceLibrary(
    workspace_path: vscode.WorkspaceFolder,
    new_library_settings: string[] | undefined
) {
    // Get the workspace folder configuration
    const configuration = vscode.workspace.getConfiguration(
        undefined,
        workspace_path.uri
    )

    // Update the workspace folder configuration with the new value
    configuration
        .update(
            "Lua.workspace.library",
            new_library_settings,
            vscode.ConfigurationTarget.WorkspaceFolder
        )
        .then(
            () => {
                // Configuration updated successfully
                void vscode.window.showInformationMessage(
                    "Workspace folder configuration updated"
                )
            },
            (error) => {
                // Error occurred while updating the configuration
                void vscode.window.showInformationMessage(
                    "Failed to update workspace folder configuration:",
                    error
                )
            }
        )
}
