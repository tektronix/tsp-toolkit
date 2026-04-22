import * as vscode from "vscode"

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
