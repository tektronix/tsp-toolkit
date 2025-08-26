//this class is responsible for managing the saved script generation
// and providing the tree view for the saved scripts from settings.json

import * as vscode from "vscode"
export interface IVChar {
    name: string
    config: string
}

export interface tspScriptGen {
    [type: string]: IVChar[]
}

export class SavedScriptGenManager {
    public savedScripts: IVChar[] = []

    constructor() {}

    loadSavedConfigs(): tspScriptGen {
        const config: tspScriptGen =
            vscode.workspace
                .getConfiguration()
                .get<tspScriptGen>("tsp.script_generation") ?? {}

        this.savedScripts = config?.["I-V Characterization"]

        return config
    }

    addSession(input: string, config: string): void {
        const existingConfigs: tspScriptGen = this.loadSavedConfigs()

        existingConfigs["I-V Characterization"] =
            existingConfigs["I-V Characterization"] || []

        const newScript: IVChar = {
            name: input,
            config: config,
        }

        existingConfigs["I-V Characterization"].push(newScript)

        vscode.workspace
            .getConfiguration("tsp")
            .update("script_generation", existingConfigs, false)
    }

    getConfig(label: string) {
        const config: IVChar[] = this.loadSavedConfigs()["I-V Characterization"]
        return config.find((s) => s.name === label)
    }

    removeSession(name: string): void {
        const existingConfigs: tspScriptGen = this.loadSavedConfigs()

        existingConfigs["I-V Characterization"] = existingConfigs[
            "I-V Characterization"
        ].filter((script) => script.name !== name)

        vscode.workspace
            .getConfiguration("tsp")
            .update("script_generation", existingConfigs, false)
    }

    updateSession(name: string, updatedConfig: string) {
        const existingConfigs: tspScriptGen = this.loadSavedConfigs()
        existingConfigs["I-V Characterization"] =
            existingConfigs["I-V Characterization"] || []
        const currentSession = existingConfigs["I-V Characterization"].find(
            (s) => s.name === name,
        )
        if (currentSession) {
            currentSession.config = updatedConfig
            try {
                vscode.workspace
                    .getConfiguration("tsp")
                    .update("script_generation", existingConfigs, false)
            } catch (error) {
                console.error(
                    "Failed to update script generation settings:",
                    error,
                )
            }
        }
    }
}

export class scriptNameValidator {
    validateName(input: string | undefined): boolean {
        if (input === undefined) {
            return false
        }

        const trimmed = input.trim()

        if (!trimmed) {
            vscode.window.showInformationMessage("Script name cannot be empty.")
            return false
        }

        if (trimmed.length > 20) {
            vscode.window.showInformationMessage(
                "Script name must be 20 characters or less.",
            )
            return false
        }

        // Only allow alphanumeric, spaces, dashes, and underscores
        if (!/^[\w\- ]+$/.test(trimmed)) {
            vscode.window.showInformationMessage(
                "Script name can only contain letters, numbers, spaces, dashes, and underscores.",
            )
            return false
        }

        const existingConfigs: tspScriptGen =
            new SavedScriptGenManager().loadSavedConfigs()

        existingConfigs["I-V Characterization"] =
            existingConfigs["I-V Characterization"] || []

        const existingNames: string[] = existingConfigs[
            "I-V Characterization"
        ].map((s) => s.name)

        if (existingNames.includes(trimmed)) {
            vscode.window.showInformationMessage(
                "A script with this name already exists.",
            )
            return false
        }

        return true
    }
}
