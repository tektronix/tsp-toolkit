import * as vscode from "vscode"

export class StatusBarManager {
    private static _instance: StatusBarManager | undefined = undefined
    private _statusBarItem: vscode.StatusBarItem
    private _hideTimeout: NodeJS.Timeout | undefined

    private constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        )
    }

    static get instance(): StatusBarManager {
        if (!StatusBarManager._instance) {
            StatusBarManager._instance = new StatusBarManager()
        }
        return StatusBarManager._instance
    }


    /**
     * Show a message in the status bar with icon and timeout
     * @param message The message to display
     * @param type The type of message: 'info', 'warning', 'error', 'progress'
     * @param timeout Optional timeout in milliseconds (default: 5000 for info/warning, 8000 for error, 0 for progress)
     */
    showMessage(message: string, type: 'info' | 'warning' | 'error' | 'progress' = 'info', timeout?: number): void {
        let icon = "$(info)";
        let defaultTimeout = 5000;
        switch (type) {
            case 'warning':
                icon = "$(warning)";
                defaultTimeout = 5000;
                break;
            case 'error':
                icon = "$(error)";
                defaultTimeout = 8000;
                break;
            case 'progress':
                icon = "$(sync~spin)";
                defaultTimeout = 0;
                break;
            case 'info':
            default:
                icon = "$(info)";
                defaultTimeout = 5000;
        }
        this._showMessage(message, icon, timeout !== undefined ? timeout : defaultTimeout);
    }

    /**
     * Hide the status bar message
     */
    hide(): void {
        if (this._hideTimeout) {
            clearTimeout(this._hideTimeout)
            this._hideTimeout = undefined
        }
        this._statusBarItem.hide()
    }

    /**
     * Dispose the status bar item
     */
    dispose(): void {
        this.hide()
        this._statusBarItem.dispose()
    }

    private _showMessage(message: string, icon: string, timeout: number): void {
        if (this._hideTimeout) {
            clearTimeout(this._hideTimeout)
            this._hideTimeout = undefined
        }

        this._statusBarItem.text = `${icon} ${message}`
        this._statusBarItem.show()

        if (timeout > 0) {
            this._hideTimeout = setTimeout(() => {
                this._statusBarItem.hide()
                this._hideTimeout = undefined
            }, timeout)
        }
    }
}
