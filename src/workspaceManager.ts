import * as fs from "fs"
import * as path from "path"
import { COMMAND_SETS } from "@tek-engineering/keithley_instrument_libraries"
import * as vscode from "vscode"

const supported_models = fs
    .readdirSync(COMMAND_SETS)
    .filter((folder) => fs.statSync(`${COMMAND_SETS}/${folder}`).isDirectory())

export const RELATIVE_TSP_CONFIG_FILE_PATH = path.join(".vscode", "tspConfig")

const tspSchemaContent = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "nodes": {
      "type": "object",
      "patternProperties": {
        "^node\\\\d+$": {
              "type": "object",
              "properties": {
                "model": {
                  "type": "string",
                  "enum": ${JSON.stringify(supported_models)}
                },
                "slots": {
                  "type": "object",
                  "patternProperties": {
                    "^slot\\\\d+$": {
                      "type": "string"
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
        "enum": ${JSON.stringify(supported_models)}
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
        path.join(folderPath, RELATIVE_TSP_CONFIG_FILE_PATH)
    )

    vscode.workspace.fs.stat(nodeConfigFolderPath).then(
        () => {
            console.log("Folder already exists:", nodeConfigFolderPath.fsPath)
        },
        async () => {
            await fs.promises.mkdir(nodeConfigFolderPath.fsPath, {
                recursive: true,
            })
            const tspconfig = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "config.tsp.json"
                )
            )
            await fs.promises.writeFile(tspconfig.fsPath, tspConfigJsonContent)

            const tspSchema = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "tspSchema.json"
                )
            )
            await fs.promises.writeFile(tspSchema.fsPath, tspSchemaContent)

            const nodeTable = vscode.Uri.file(
                path.join(
                    folderPath,
                    RELATIVE_TSP_CONFIG_FILE_PATH,
                    "nodeTable.tsp"
                )
            )
            await fs.promises.writeFile(nodeTable.fsPath, "")
        }
    )
}

/**
 * Update filesAssociations settings { "*.tsp": "lua" }
 */
function updateFileAssociations() {
    const newAssociations = { "*.tsp": "lua" }
    // Get the workspace folder configuration
    const config = vscode.workspace.getConfiguration()
    const currentAssociations = config.get("files.associations")
    const updatedAssociations = Object.assign(
        {},
        currentAssociations,
        newAssociations
    )
    config
        .update(
            "files.associations",
            updatedAssociations,
            vscode.ConfigurationTarget.Workspace
        )
        .then(
            () => {
                // Configuration updated successfully
                void vscode.window.showInformationMessage(
                    "files.associations configuration updated"
                )
            },
            (error) => {
                // Error occurred while updating the configuration
                void vscode.window.showInformationMessage(
                    "Failed to update files.associations configuration:",
                    error
                )
            }
        )
}
/**
 * Disable Lua.diagnostics.libraryFiles for library files
 * @param workspace_path workspace folder path
 */
function disableDiagnosticForLibraryFiles(
    workspace_path: vscode.WorkspaceFolder
) {
    const configuration = vscode.workspace.getConfiguration(
        undefined,
        workspace_path.uri
    )
    configuration
        .update(
            "Lua.diagnostics.libraryFiles",
            "Disable",
            vscode.ConfigurationTarget.WorkspaceFolder
        )
        .then(
            () => {
                // Configuration updated successfully
                void vscode.window.showInformationMessage(
                    "Lua.diagnostics.libraryFiles configuration updated"
                )
            },
            (error) => {
                // Error occurred while updating the configuration
                void vscode.window.showInformationMessage(
                    "Failed to update Lua.diagnostics.libraryFiles configuration:",
                    error
                )
            }
        )
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
                updateFileAssociations()
                disableDiagnosticForLibraryFiles(folder)
                createTspFileFolder(folderPath)
            }
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
