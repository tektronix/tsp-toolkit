import * as fs from "fs"
import * as path from "path"
import { COMMAND_SETS } from "@tektronix/keithley_instrument_libraries"
import * as vscode from "vscode"
import { onDidChangeTspConfigFile } from "./extension"
import { Log } from "./logging"

/**
 * An array of supported model names.
 *
 * This array is populated by reading the directories within the COMMAND_SETS directory.
 * Each directory name represents a supported model.
 *
 * @type {string[]}
 */
let supported_models: string[] = fs
    .readdirSync(COMMAND_SETS)
    .filter((folder) => fs.statSync(`${COMMAND_SETS}/${folder}`).isDirectory())

// Remove "tsp-lua-5.0" from supported_models if it exists, because its am lua 5.0 library not a model
supported_models = supported_models.filter((model) => model !== "tsp-lua-5.0")

// Remove "nodes_definitions" from supported_models if it exists, because this folder is getting created at runtime to manager node definitions
supported_models = supported_models.filter(
    (model) => model !== "nodes_definitions",
)

export const RELATIVE_TSP_CONFIG_FILE_PATH = path.join(".vscode", "tspConfig")

const tspSchemaContent = `{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "nodes": {
            "type": "object",
            "description": "Configuration for nodes in the TSP-Link network.\\n example: \\n \\"node1\\":{\\n\\t\\"model\\": \\"2460\\" \\n},\\n \\"node2\\":{\\n\\t\\"model\\": \\"2450\\" \\n}",
            "patternProperties": {
                "^node\\\\d+$": {
                    "type": "object",
                    "description": "node number for specific node \\n example:\\n node1",
                    "properties": {
                        "model": {
                            "type": "string",
                            "enum": ${JSON.stringify(supported_models)},
                            "description": "The model of the node."
                        },
                        "slots": {
                            "type": "object",
                            "description": "Configuration for slots within the node.",
                            "patternProperties": {
                                "^slot\\\\d+$": {
                                    "type": "string",
                                    "description": "The type of module in the slot."
                                }
                            },
                            "minProperties": 1
                        }
                    },
                    "required": ["model"]
                }
            }
        },
        "self": {
            "type": "string",
            "enum": ${JSON.stringify(supported_models)},
            "description": "The model of the current device or model of master node in TSP-Link network \\n example: \\n\\"self\\": \\"2450\\""
        }
    }
}`

const tspConfigJsonContent = `{
    "$schema": "./tspSchema.json",
    "nodes":{
    },
    "self": ""
}`

/**
 * Create default ".vscode/tspConfig" folder in root level directory of workspace
 * if doesn't exist.
 * @param folderPath root folder path of workspace
 *
 */
function createTspFileFolder(folderPath: string) {
    const nodeConfigFolderPath = vscode.Uri.file(
        path.join(folderPath, RELATIVE_TSP_CONFIG_FILE_PATH),
    )

    vscode.workspace.fs.stat(nodeConfigFolderPath).then(
        async () => {
            Log.trace(
                `Folder already exists: "${nodeConfigFolderPath.fsPath}"`,
                { file: "workspaceManager.ts", func: "createTspFileFolder()" },
            )
            const tspSchema = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "tspSchema.json",
                ),
            )

            // Check if tspSchema.json exists and its content
            let shouldUpdateSchema = true
            try {
                const existingSchemaContent = await fs.promises.readFile(
                    tspSchema.fsPath,
                    "utf8",
                )
                if (existingSchemaContent === tspSchemaContent) {
                    shouldUpdateSchema = false
                }
            } catch {
                // File does not exist or cannot be read, so we should create/update it
                shouldUpdateSchema = true
            }

            if (shouldUpdateSchema) {
                await vscode.workspace.fs.writeFile(
                    tspSchema,
                    Buffer.from(tspSchemaContent),
                )
            }
        },
        async () => {
            await fs.promises.mkdir(nodeConfigFolderPath.fsPath, {
                recursive: true,
            })
            const tspconfig = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "config.tsp.json",
                ),
            )
            await vscode.workspace.fs.writeFile(
                tspconfig,
                Buffer.from(tspConfigJsonContent),
            )
            const tspSchema = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "tspSchema.json",
                ),
            )
            await vscode.workspace.fs.writeFile(
                tspSchema,
                Buffer.from(tspSchemaContent),
            )
        },
    )
}

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

/**
 * Iterate over workspace folder to find file with .tsp extension
 */
export async function processWorkspaceFolders() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders) {
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath
            if (await processFiles(folderPath)) {
                createTspFileFolder(folderPath)
            }
        }
    }
}

async function getAllFiles(uri: vscode.Uri): Promise<Array<vscode.Uri>> {
    const files: Array<vscode.Uri> = []
    for (const f of await vscode.workspace.fs.readDirectory(uri)) {
        if (f[1] === vscode.FileType.File) {
            files.push(vscode.Uri.joinPath(uri, f[0]))
        } else if (f[1] === vscode.FileType.Directory) {
            for (const e of await getAllFiles(vscode.Uri.joinPath(uri, f[0]))) {
                files.push(e)
            }
        }
    }

    return files
}

function uriHasExtension(extension: string, uri: vscode.Uri): boolean {
    const fsPath = uri.fsPath // asdf.tsp
    return fsPath.substring(fsPath.length - extension.length) === extension
}

async function folderContainsExtension(
    extension: string,
    root: vscode.Uri,
): Promise<boolean> {
    const files = await getAllFiles(root)
    for (const f of files) {
        if (uriHasExtension(extension, f)) {
            return true
        }
    }
    return false
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
            // only change the settings for this folder if the folder contains a TSP file.
            if (!(await folderContainsExtension(".tsp", folder.uri))) {
                continue
            }
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
            const config_file_path = path.join(
                folder.uri.path,
                "/.vscode/tspConfig/config.tsp.json",
            )
            await onDidChangeTspConfigFile(vscode.Uri.file(config_file_path))
        }
    }
}

/**
 * Check for .tsp file is present or not
 *
 * @param folderPath folder path where .tsp file needs to check
 * @returns if file .tsp file present then it will return true
 * otherwise it will return false
 */
async function processFiles(folderPath: string): Promise<boolean> {
    const files = await fs.promises.readdir(folderPath)
    for (const file of files) {
        const filePath = path.join(folderPath, file)
        const stats = await fs.promises.stat(filePath)
        if (stats.isDirectory()) {
            const hasTSPFile = await processFiles(filePath) // Recursively process subdirectories
            if (hasTSPFile) {
                return true
            }
        } else if (path.extname(filePath) === ".tsp") {
            return true
        }
    }
    return false
}
