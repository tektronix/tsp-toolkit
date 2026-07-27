import * as vscode from "vscode"
import { Log } from "./logging"

/**
 * Represents a single session configuration
 */
export interface SessionItem {
    name: string
    config: string
}

/**
 * Collection of sessions organized by type
 */
export interface SessionCollection {
    [sessionType: string]: SessionItem[]
}

/**
 * Generic session storage manager
 * Handles persistence of sessions to VS Code workspace settings
 */
export class GenericSessionStorage {
    private readonly settingsKey: string
    private readonly sessionType: string
    private static readonly LEGACY_SETTINGS_KEY = "script_generation"
    private static readonly SCRIPT_GEN_SETTINGS_KEY = "scriptGenSessions"
    private static readonly TRIGGER_FLOW_SETTINGS_KEY = "triggerFlowSessions"

    constructor(sessionType: string, settingsKey = "script_generation") {
        this.sessionType = sessionType
        this.settingsKey = settingsKey
    }

    /**
     * Load all saved sessions from workspace settings
     */
    loadSessions(): SessionCollection {
        const config =
            vscode.workspace
                .getConfiguration()
                .get<SessionCollection>(`tsp.${this.settingsKey}`) ?? {}

        return config
    }

    /**
     * Get sessions for the specific session type
     */
    getSessionsByType(): SessionItem[] {
        const allSessions = this.loadSessions()
        return allSessions[this.sessionType] ?? []
    }

    /**
     * Get a specific session by name
     */
    getSession(name: string): SessionItem | undefined {
        const sessions = this.getSessionsByType()
        return sessions.find((s) => s.name === name)
    }

    /**
     * Add a new session
     */
    addSession(name: string, config: string): void {
        const existingSessions = this.loadSessions()
        existingSessions[this.sessionType] =
            existingSessions[this.sessionType] || []

        const newSession: SessionItem = {
            name: name,
            config: config,
        }

        existingSessions[this.sessionType].push(newSession)

        this.updateSettings(existingSessions)
    }

    /**
     * Update an existing session
     */
    updateSession(name: string, updatedConfig: string): void {
        const existingSessions = this.loadSessions()
        existingSessions[this.sessionType] =
            existingSessions[this.sessionType] || []

        const currentSession = existingSessions[this.sessionType].find(
            (s) => s.name === name,
        )

        if (currentSession) {
            currentSession.config = updatedConfig
            try {
                this.updateSettings(existingSessions)
            } catch (error) {
                console.error(
                    `Failed to update ${this.sessionType} settings:`,
                    error,
                )
            }
        }
    }

    /**
     * Remove a session by name
     */
    removeSession(name: string): void {
        const existingSessions = this.loadSessions()

        existingSessions[this.sessionType] = (
            existingSessions[this.sessionType] || []
        ).filter((session) => session.name !== name)

        this.updateSettings(existingSessions)
    }

    /**
     * Remove all sessions of this type
     */
    removeAllSessions(): void {
        const existingSessions = this.loadSessions()
        existingSessions[this.sessionType] = []
        this.updateSettings(existingSessions)
    }

    /**
     * Check if a session with the given name exists
     */
    sessionExists(name: string): boolean {
        const sessions = this.getSessionsByType()
        return sessions.some((s) => s.name === name)
    }

    /**
     * Get count of sessions
     */
    getSessionCount(): number {
        return this.getSessionsByType().length
    }

    /**
     * Update workspace settings
     */
    private updateSettings(sessions: SessionCollection): void {
        vscode.workspace
            .getConfiguration("tsp")
            .update(this.settingsKey, sessions, false)
    }

    public static async migrateLegacySessions(): Promise<void> {
        const workspaceConfig = vscode.workspace.getConfiguration()

        // Nothing to migrate if legacy key doesn't exist
        const legacyConfig = workspaceConfig.get<SessionCollection>(
            `tsp.${GenericSessionStorage.LEGACY_SETTINGS_KEY}`,
        )

        if (!legacyConfig || Object.keys(legacyConfig).length === 0) {
            return
        }

        const ivSessions = legacyConfig["I-V Characterization"] ?? []
        const triggerFlowSessions = legacyConfig["Trigger Flow"] ?? []

        // If either new key already exists, assume migration has already
        // been performed (or the user has started using the new version).
        const scriptGenConfig = workspaceConfig.get<SessionCollection>(
            `tsp.${GenericSessionStorage.SCRIPT_GEN_SETTINGS_KEY}`,
        )

        const triggerFlowConfig = workspaceConfig.get<SessionCollection>(
            `tsp.${GenericSessionStorage.TRIGGER_FLOW_SETTINGS_KEY}`,
        )

        try {
            if (!scriptGenConfig && ivSessions.length > 0) {
                await workspaceConfig.update(
                    `tsp.${GenericSessionStorage.SCRIPT_GEN_SETTINGS_KEY}`,
                    {
                        "I-V Characterization": ivSessions,
                    },
                    vscode.ConfigurationTarget.Workspace,
                )
            }

            if (!triggerFlowConfig && triggerFlowSessions.length > 0) {
                await workspaceConfig.update(
                    `tsp.${GenericSessionStorage.TRIGGER_FLOW_SETTINGS_KEY}`,
                    {
                        "Trigger Flow": triggerFlowSessions,
                    },
                    vscode.ConfigurationTarget.Workspace,
                )
            }

            // Remove legacy storage once migration succeeds
            await workspaceConfig.update(
                `tsp.${GenericSessionStorage.LEGACY_SETTINGS_KEY}`,
                undefined,
                vscode.ConfigurationTarget.Workspace,
            )
        } catch (error) {
            console.error("Failed to migrate legacy sessions:", error)
            Log.error(
                `Failed to migrate legacy session storage: ${error instanceof Error ? error.message : String(error)}`,
                {
                    file: "genericSessionStorage.ts",
                    func: "migrateLegacySessions()",
                },
            )
        }
    }
}

/**
 * Session name validator
 */
export class SessionNameValidator {
    constructor(private readonly storage: GenericSessionStorage) {}

    /**
     * Validate session name according to rules
     */
    validateName(input: string | undefined): boolean {
        if (input === undefined) {
            return false
        }

        const trimmed = input.trim()

        if (!trimmed) {
            vscode.window.showInformationMessage(
                "Session name cannot be empty.",
            )
            return false
        }

        if (trimmed.length > 20) {
            vscode.window.showInformationMessage(
                "Session name must be 20 characters or less.",
            )
            return false
        }

        // Only allow alphanumeric, spaces, dashes, and underscores
        if (!/^[\w\- ]+$/.test(trimmed)) {
            vscode.window.showInformationMessage(
                "Session name can only contain letters, numbers, spaces, dashes, and underscores.",
            )
            return false
        }

        if (this.storage.sessionExists(trimmed)) {
            vscode.window.showInformationMessage(
                "A session with this name already exists.",
            )
            return false
        }

        return true
    }
}
