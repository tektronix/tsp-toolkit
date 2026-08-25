import * as os from "os"
import * as child from "child_process"
import { join } from "path"
import { mkdtempSync, statSync } from "fs"
import * as vscode from "vscode"
import { EXECUTABLE } from "./kic-cli"
import { IIDNInfo, InstrInfo, IoType } from "./resourceManager"
import { LOG_DIR } from "./utility"
import { Log } from "./logging"
import { Instrument } from "./instrument"
import { InstrumentProvider } from "./instrumentProvider"

/**
 * The possible statuses of a connection interface/protocol
 */
export enum ConnectionStatus {
    /**
     * This instrument is ignored. This variant should not be used for interfaces
     */
    Ignored,
    /**
     * This connection interface was deemed inactive and will not respond to connection attempts
     */
    Inactive,
    /**
     * This connection interface was deemed active and will respond to connection attempts
     */
    Active,
    /**
     * This connection interface is in the process of connecting to the instrument
     */
    Connecting,
    /**
     * This connection interface was deemed connected and already has a terminal associated with it
     */
    Connected,
}

export type LoginStatus =
    | {
          type: "Protected"
          username: boolean
          password: boolean
          keyring?: string
      }
    | { type: "NotPrompted" }
    | { type: "InUse" }

export function connectionStatusIcon(
    status: ConnectionStatus | undefined,
): vscode.ThemeIcon {
    switch (status) {
        case undefined:
        case ConnectionStatus.Inactive:
            return new vscode.ThemeIcon(
                "vm-outline",
                new vscode.ThemeColor("list.deemphasizedForeground"),
            )
        case ConnectionStatus.Active:
            return new vscode.ThemeIcon(
                "vm-active",
                new vscode.ThemeColor("progressBar.background"),
            )
        case ConnectionStatus.Connecting:
            return new vscode.ThemeIcon(
                "sync~spin",
                new vscode.ThemeColor("progressBar.background"),
            )
        case ConnectionStatus.Connected:
            return new vscode.ThemeIcon(
                "vm-running",
                new vscode.ThemeColor("testing.iconPassed"),
            )
    }

    return new vscode.ThemeIcon("warning")
}

export function statusToString(status: ConnectionStatus | undefined): string {
    switch (status) {
        case ConnectionStatus.Ignored:
            return "Ignored"
        case undefined:
        case ConnectionStatus.Inactive:
            return "Inactive"
        case ConnectionStatus.Active:
            return "Active"
        case ConnectionStatus.Connecting:
            return "Connecting"
        case ConnectionStatus.Connected:
            return "Connected"
    }
}

export function contextValueStatus(
    contextValue: string,
    status: ConnectionStatus | undefined,
): string {
    if (contextValue.match(/Connected|Connecting|Active|Inactive/)) {
        return contextValue.replace(
            /Connected|Connecting|Active|Inactive/,
            statusToString(status ?? ConnectionStatus.Inactive),
        )
    } else {
        return contextValue + statusToString(status)
    }
}

/**
 * A tree item that holds the details of an instrument connection interface/protocol
 */
export class Connection extends vscode.TreeItem implements vscode.Disposable {
    private _type: IoType = IoType.Lan
    private _addr: string = ""
    private _keyring: string | null | undefined = undefined
    private _status: ConnectionStatus | undefined = undefined

    private _parent: Instrument | undefined = undefined

    private _onChangedStatus = new vscode.EventEmitter<
        ConnectionStatus | undefined
    >()

    private _terminal: vscode.Terminal | undefined = undefined
    private _background_process: child.ChildProcess | undefined = undefined

    readonly onChangedStatus: vscode.Event<ConnectionStatus | undefined> =
        this._onChangedStatus.event

    static from(info: InstrInfo) {
        return new Connection(info.io_type, info.instr_address)
    }

    constructor(conn_type: IoType, addr: string) {
        super(addr, vscode.TreeItemCollapsibleState.None)
        this._type = conn_type
        this._addr = addr
        this.contextValue = "CONN"
        this.status = ConnectionStatus.Inactive
        this.enable(true)
    }

    dispose() {
        if (this._terminal) {
            this._terminal.dispose()
            this._terminal = undefined
        }

        this.terminateBackgroundProcess(this._background_process)
        this._onChangedStatus.dispose()
    }

    enable(enable: boolean) {
        const term = enable ? "Enabled" : "Disabled"
        if (this.contextValue && this.contextValue?.match(/Disabled|Enabled/)) {
            this.contextValue = this.contextValue.replace(
                /Disabled|Enabled/,
                term,
            )
        } else {
            this.contextValue = this.contextValue + term
        }
    }

    get type(): IoType {
        return this._type
    }

    get keyring(): string | null | undefined {
        return this._keyring
    }

    get addr(): string {
        return this._addr
    }

    set addr(addr: string) {
        this._addr = addr
        this.label = addr
    }

    get status(): ConnectionStatus | undefined {
        if (this.terminal && this._terminal?.exitStatus === undefined) {
            this.status = ConnectionStatus.Connected
        }
        return this._status
    }

    set status(status: ConnectionStatus | undefined) {
        this.iconPath = connectionStatusIcon(status)
        this.contextValue = contextValueStatus(
            this.contextValue ?? "CONN",
            status,
        )

        if (this._status !== status) {
            this._status = status
            this._onChangedStatus.fire(this._status)
        }
    }

    get parent(): Instrument | undefined {
        return this._parent
    }

    set parent(instr: Instrument) {
        this._parent = instr
    }

    get terminal() {
        return this._terminal
    }

    /**
     * Combine multiple cancellation tokens into one token.
     *
     * The returned disposable must be disposed when the combined token is no
     * longer required. This prevents cancellation event listeners from leaking.
     */
    private static combineCancellationTokens(
        ...tokens: vscode.CancellationToken[]
    ): {
        token: vscode.CancellationToken
        dispose: () => void
    } {
        const source = new vscode.CancellationTokenSource()
        const disposables: vscode.Disposable[] = []

        const cancel = () => {
            if (!source.token.isCancellationRequested) {
                source.cancel()
            }
        }

        for (const token of tokens) {
            if (token.isCancellationRequested) {
                cancel()
                break
            }

            disposables.push(token.onCancellationRequested(cancel))
        }

        return {
            token: source.token,
            dispose: () => {
                for (const disposable of disposables) {
                    disposable.dispose()
                }

                disposables.length = 0
                source.dispose()
            },
        }
    }

    /**
     * Terminate a specific background process.
     *
     * The process is cleared from _background_process only if it is still the
     * process currently owned by this Connection. This prevents an old
     * timeout/callback from accidentally clearing or terminating a newer
     * process.
     */
    private terminateBackgroundProcess(
        process: child.ChildProcess | undefined,
    ): void {
        if (!process) {
            return
        }

        if (os.platform() === "win32" && process.pid) {
            // The following was the only configuration of options found to work.
            // Do NOT remove the `/F` unless you have rigorously proven that it
            // consistently works.
            child.spawnSync("TaskKill", [
                "/PID",
                process.pid.toString(),
                "/T",
                "/F",
            ])
        } else if (!process.killed) {
            process.kill("SIGINT")
        }

        if (this._background_process === process) {
            this._background_process = undefined
        }
    }

    /**
     * Terminate the currently active background process.
     */
    private terminateBackgroundProcessOnCancel(): void {
        this.terminateBackgroundProcess(this._background_process)
    }

    /**
     * Wraps runConnectFlow with a user-configurable connection timeout.
     *
     * Cancellation can happen from either:
     * - the user cancelling the VS Code progress notification, or
     * - the configured connection timeout expiring.
     *
     * Both paths use the same cancellation handling inside runConnectFlow,
     * which terminates the active background process and restores the
     * original connection status.
     */
    private async runConnectFlowWithTimeout(
        name: string | undefined,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        cancel: vscode.CancellationToken,
        orig_status: ConnectionStatus | undefined,
        LOGLOC: { file: string; func: string },
    ): Promise<boolean> {
        const configuredTimeout = vscode.workspace
            .getConfiguration("tsp")
            .get<number>("connectionTimeout", 30)

        const timeoutSeconds =
            Number.isFinite(configuredTimeout) && configuredTimeout >= 0
                ? configuredTimeout
                : 30

        // A timeout of 0 explicitly disables the connection timeout.
        if (timeoutSeconds === 0) {
            return this.runConnectFlow(
                name,
                progress,
                cancel,
                orig_status,
                LOGLOC,
            )
        }

        const timeoutSource = new vscode.CancellationTokenSource()

        const combined = Connection.combineCancellationTokens(
            cancel,
            timeoutSource.token,
        )

        const timeoutHandle = setTimeout(() => {
            // If the user already cancelled, don't report a timeout.
            if (cancel.isCancellationRequested) {
                return
            }

            Log.warn(
                `Connection to ${this.addr} timed out after ${timeoutSeconds} second(s)`,
                LOGLOC,
            )

            vscode.window.showWarningMessage(
                `Connecting to ${this.addr} timed out after ${timeoutSeconds} second(s). The connection attempt has been cancelled.`,
            )

            timeoutSource.cancel()
        }, timeoutSeconds * 1000)

        try {
            return await this.runConnectFlow(
                name,
                progress,
                combined.token,
                orig_status,
                LOGLOC,
            )
        } finally {
            clearTimeout(timeoutHandle)
            combined.dispose()
        }
    }

    private async runConnectFlow(
        name: string | undefined,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        cancel: vscode.CancellationToken,
        orig_status: ConnectionStatus | undefined,
        LOGLOC: { file: string; func: string },
    ): Promise<boolean> {
        const cancelIfRequested = (): boolean => {
            if (!cancel.isCancellationRequested) {
                return false
            }

            // Cancellation can happen while awaited operations are in flight.
            // Re-checking here prevents follow-up side effects after cancellation.
            this.status = orig_status
            return true
        }

        this.status = ConnectionStatus.Connecting

        // temporary added delay for testing
        //await new Promise((resolve) => setTimeout(resolve, 3000))

        cancel.onCancellationRequested(() => {
            Log.info("Connection attempt cancelled", LOGLOC)
            this.terminateBackgroundProcessOnCancel()
            this.status = orig_status
        })

        if (cancelIfRequested()) {
            return false
        }
        //Dump output queue if enabled
        // Disabled dumping output queue on connect until it is reimplemented
        //let dump_path = undefined
        //if (
        //    vscode.workspace
        //        .getConfiguration("tsp")
        //        .get("dumpQueueOnConnect") === true
        //) {
        //    progress.report({
        //        message:
        //            "Dumping data from instrument output queue",
        //    })
        //    dump_path = await this.dumpOutputQueue()
        //}

        progress.report({
            message: "Checking if instrument requires authentication",
        })

        if (cancelIfRequested()) {
            return false
        }

        const login_required = await this.checkLogin()

        // check after await: cancellation might occur while checkLogin is running
        if (cancelIfRequested()) {
            return false
        }

        if (login_required.type === "NotPrompted") {
            Log.debug("No login required", LOGLOC)
        } else if (login_required.type === "InUse") {
            vscode.window.showErrorMessage(
                `Instrument at ${this._addr} already in use. Make sure you logout at other locations before connecting.`,
            )
            Log.error("Connection failed: instrument already in use.", LOGLOC)
            this.status = orig_status
            return false
        } else if (login_required.type === "Protected") {
            for (let i = 1; i <= 3; i++) {
                //TODO: Prompt for the required information (if any)
                if (i > 1 && login_required.keyring) {
                    login_required.keyring = undefined
                }

                progress.report({
                    message: `Attempt ${i} of 3: Prompting for instrument authentication details`,
                })

                // check before prompt: avoid opening/continuing interactive UI after cancel
                if (cancelIfRequested()) {
                    return false
                }

                const login_details = await this.promptDetails(login_required)

                // check after await: user may cancel while input box is open
                if (cancelIfRequested()) {
                    return false
                }

                this._keyring = await this.login(login_details)

                // check after await: login process may still complete after cancellation
                if (cancelIfRequested()) {
                    return false
                }

                if (this._keyring) {
                    break
                }

                if (
                    (this._keyring === undefined || this._keyring === null) &&
                    i < 3
                ) {
                    vscode.window.showWarningMessage(
                        `Credentials incorrect for instrument at ${this._addr}, please try again.`,
                    )
                    Log.error(
                        "Credentials are incorrect, please try again.",
                        LOGLOC,
                    )
                }

                if (
                    (this._keyring === undefined || this._keyring === null) &&
                    i === 3
                ) {
                    vscode.window.showErrorMessage(
                        `Unable to connect to instrument at ${this._addr}, please check your credentials and try again.`,
                    )
                    Log.error(
                        "Connection failed: unable to reach requested instrument, user exceeded login attempts.",
                        LOGLOC,
                    )
                    this.status = orig_status
                    return false
                }
            }
        } else {
            vscode.window.showErrorMessage(
                `Unable to connect to instrument at ${this._addr}`,
            )
            Log.error(
                "Connection failed: unable to reach requested instrument.",
                LOGLOC,
            )
            this.status = orig_status
            return false
        }

        //Get instrument info
        progress.report({
            message: "Getting instrument information",
        })

        if (cancelIfRequested()) {
            return false
        }

        const info = await this.ping()

        // check after await: ping can return after cancellation was requested
        if (cancelIfRequested()) {
            return false
        }

        if (!info) {
            vscode.window.showErrorMessage(
                `Unable to connect to instrument at ${this.addr}: could not get instrument information`,
            )
            this.status = orig_status
            return false
        }

        if (!this._parent) {
            this._parent = new Instrument(info, name !== "" ? name : undefined)
            this._parent.addConnection(this)
        } else {
            this._parent.updateInfo(info)
        }

        // check before persistence to avoid saving cancelled connection attempts
        if (cancelIfRequested()) {
            return false
        }

        InstrumentProvider.instance.addOrUpdateInstrument(this._parent)
        await InstrumentProvider.instance.saveInstrument(this._parent)

        // check after await: save operation may complete after cancellation
        if (cancelIfRequested()) {
            return false
        }

        const additional_terminal_args: string[] = []

        // Disabled dumping output queue on connect until it is reimplemented
        //if (dump_path) {
        //    additional_terminal_args.push(
        //        "--dump-output",
        //        dump_path,
        //    )
        //}

        progress.report({
            message: `Connecting to instrument with model ${info.model} and S/N ${info.serial_number}`,
        })

        //Connect terminal
        if (cancelIfRequested()) {
            return false
        }

        const terminal_args = [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "connect",
            this.addr,
        ]

        for (const a of additional_terminal_args) {
            terminal_args.push(a)
        }

        if (this._keyring) {
            terminal_args.push("--keyring", this._keyring)
        }

        if (vscode.workspace.getConfiguration("tsp").get("reset") === true) {
            terminal_args.push("--reset")
        }

        if (
            vscode.workspace.getConfiguration("tsp").get("clearErrorQueue") ===
            true
        ) {
            terminal_args.push("--clear-error-queue")
        }

        Log.debug("Starting VSCode Terminal", LOGLOC)

        this._terminal = vscode.window.createTerminal({
            name: this._parent.name,
            shellPath: EXECUTABLE,
            shellArgs: terminal_args,
            isTransient: true, // Don't try to reinitialize the terminal when restarting vscode
            iconPath: {
                light: vscode.Uri.file(
                    join(
                        __dirname,
                        "..",
                        "resources",
                        "light",
                        "tsp-terminal-icon.svg",
                    ),
                ),
                dark: vscode.Uri.file(
                    join(
                        __dirname,
                        "..",
                        "resources",
                        "dark",
                        "tsp-terminal-icon.svg",
                    ),
                ),
            },
        })

        this._terminal.show(false)

        // Handle cancellation after terminal is created
        if (cancelIfRequested()) {
            this._terminal.dispose()
            this._terminal = undefined
            return false
        }

        this.status = ConnectionStatus.Connected

        vscode.window.onDidCloseTerminal((t) => {
            Log.info("Terminal closed", LOGLOC)

            if (
                t.creationOptions.iconPath !== undefined &&
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                t.creationOptions.iconPath
                    .toString()
                    .search("tsp-terminal-icon") &&
                t.name === this._parent?.name &&
                t.processId === this._terminal?.processId
            ) {
                this.status = ConnectionStatus.Active
                this._terminal = undefined

                if (
                    t.exitStatus?.reason !== vscode.TerminalExitReason.Process
                ) {
                    setTimeout(() => {
                        Log.debug("Resetting closed instrument", LOGLOC)
                        this.reset().catch(() => {})
                        this.status = ConnectionStatus.Active
                    }, 500)
                }
            }
        }, this)

        Log.debug(`Connected to ${this._parent.name}`, LOGLOC)

        progress.report({
            message: `Connected to instrument with model ${info.model} and S/N ${info.serial_number}, saving to global settings`,
        })

        return true
    }

    async checkLogin(timeout_ms?: number): Promise<LoginStatus> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.checkLogin()",
        }

        Log.debug("Checking if instrument requires login", LOGLOC)

        const backgroundProcess = child.spawn(
            EXECUTABLE,
            [
                "--log-file",
                join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`,
                ),
                "check-login",
                this.addr,
            ],
            {
                env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
            },
        )

        this._background_process = backgroundProcess

        let timeoutHandle: NodeJS.Timeout | undefined

        if (timeout_ms !== undefined && timeout_ms > 0) {
            timeoutHandle = setTimeout(() => {
                if (this._background_process === backgroundProcess) {
                    this.terminateBackgroundProcess(backgroundProcess)
                }
            }, timeout_ms)
        }

        try {
            const requirements = await new Promise<LoginStatus>((resolve) => {
                let data = ""

                backgroundProcess.stderr?.on("data", (chunk) => {
                    Log.trace(`Info stderr: ${chunk}`, LOGLOC)
                })

                backgroundProcess.stdout?.on("data", (chunk) => {
                    data += chunk
                })

                backgroundProcess.on("exit", (code) => {
                    if (code === 0) {
                        resolve({ type: "NotPrompted" })
                        return
                    }

                    if (code === 2) {
                        resolve({ type: "InUse" })
                        return
                    }

                    if (code === 3 || code === 4) {
                        const ret: {
                            username: boolean
                            password: boolean
                            keyring?: string
                        } = {
                            username: false,
                            password: false,
                            keyring: undefined,
                        }

                        const d = data.toString()
                        const [, details] = d.split(": ")

                        if (details) {
                            const reqs = details.split(",")

                            if (
                                (reqs.length > 1 &&
                                    d.search(/USERNAME/g) === -1) ||
                                reqs.length > 2
                            ) {
                                ret.keyring = reqs[reqs.length - 1].trim()
                            }
                        }

                        ret.password = true

                        if (d.search(/USERNAME/g) !== -1) {
                            ret.username = true
                        }

                        resolve({
                            type: "Protected",
                            username: ret.username,
                            password: ret.password,
                            keyring: ret.keyring,
                        })
                        return
                    }

                    resolve({ type: "NotPrompted" })
                })
            })

            const exit_code = backgroundProcess.exitCode

            Log.trace(
                `Info process exited with code: ${exit_code}, requirements: ${JSON.stringify(requirements)}`,
                LOGLOC,
            )

            return requirements
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }

            if (this._background_process === backgroundProcess) {
                this._background_process = undefined
            }
        }
    }

    async promptDetails(reqs: {
        username: boolean
        password: boolean
        keyring?: string
    }): Promise<{ username?: string; password?: string; keyring?: string }> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.promptDetails()",
        }

        Log.debug("Prompting user for login details", LOGLOC)

        const credentials: {
            username?: string
            password?: string
            keyring?: string
        } = {
            username: undefined,
            password: undefined,
            keyring: undefined,
        }

        if (reqs.keyring) {
            credentials.keyring = reqs.keyring
            return credentials
        }

        // if (reqs.username) {
        //     credentials.username = await vscode.window.showInputBox({
        //         title: "Enter Username",
        //         placeHolder: "username",
        //         prompt: "Enter the username for the instrument to which you are trying to connect.",
        //         ignoreFocusOut: true,
        //     })
        // }

        if (reqs.password) {
            credentials.password = await vscode.window.showInputBox({
                title: "Enter Password",
                placeHolder: "password",
                password: true,
                prompt: "Enter the password for the instrument to which you are trying to connect.",
                ignoreFocusOut: true,
            })
        }

        return credentials
    }

    /**
     * Login to the instrument and get back the ID of the stored credential from the system credential manager.
     *
     * @param credentials The username (optional) and password (optional) to use to login to the instrument
     * @returns The keyring identifier used to access the instrument credentials
     */
    async login(credentials: {
        username?: string
        password?: string
        keyring?: string
    }): Promise<string | null | undefined> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.login()",
        }

        Log.debug("Logging into instrument", LOGLOC)

        const args = [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "login",
            this.addr,
        ]

        if (credentials.keyring) {
            args.push("--keyring", credentials.keyring)
        } else {
            if (!credentials.username && !credentials.password) {
                return null
            }

            if (credentials.username) {
                args.push("--username", credentials.username)
            }

            if (credentials.password) {
                args.push("--password", credentials.password)
            }
        }

        const backgroundProcess = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })

        this._background_process = backgroundProcess

        try {
            const keyring_id = await new Promise<string>((resolve) => {
                let data = ""

                backgroundProcess.stderr?.on("data", (chunk) => {
                    Log.trace(`Info stderr: ${chunk}`, LOGLOC)
                })

                backgroundProcess.stdout?.on("data", (chunk) => {
                    data += chunk
                })

                backgroundProcess.on("close", () => {
                    resolve(data.trim())
                })
            })

            const exit_code = backgroundProcess.exitCode

            Log.trace(
                `Login process exited with code: ${exit_code}, information: ${keyring_id.trim()}`,
                LOGLOC,
            )

            if (keyring_id === "") {
                Log.error(
                    "Unable to get keyring id after logging into instrument.",
                    LOGLOC,
                )
                return undefined
            }

            return keyring_id
        } finally {
            if (this._background_process === backgroundProcess) {
                this._background_process = undefined
            }
        }
    }

    async ping(timeout_ms?: number): Promise<IIDNInfo | null> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.ping()",
        }

        Log.debug("Getting instrument information", LOGLOC)

        const args = [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "ping",
            "--json",
            this.addr,
        ]

        if (this._keyring) {
            args.push("--keyring", this._keyring)
        }

        const backgroundProcess = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })

        this._background_process = backgroundProcess

        let timeoutHandle: NodeJS.Timeout | undefined

        if (timeout_ms !== undefined && timeout_ms > 0) {
            timeoutHandle = setTimeout(() => {
                if (this._background_process === backgroundProcess) {
                    this.terminateBackgroundProcess(backgroundProcess)
                }
            }, timeout_ms)
        }

        try {
            const info_string = await new Promise<string | null>((resolve) => {
                let data = ""

                backgroundProcess.stderr?.on("data", (chunk) => {
                    Log.trace(`Info stderr: ${chunk}`, LOGLOC)
                })

                backgroundProcess.stdout?.on("data", (chunk) => {
                    data += chunk
                })

                backgroundProcess.on("close", (code) => {
                    if (code === 0) {
                        resolve(data)
                        return
                    }

                    resolve(null)
                })
            })

            if (!info_string) {
                return null
            }

            const exit_code = backgroundProcess.exitCode

            Log.trace(
                `Info process exited with code: ${exit_code}, information: ${info_string.trim()}`,
                LOGLOC,
            )

            if (info_string === "") {
                Log.error(
                    "Unable to connect to instrument, could not get instrument information",
                    LOGLOC,
                )
                return null
            }

            return <IIDNInfo>JSON.parse(info_string)
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }

            if (this._background_process === backgroundProcess) {
                this._background_process = undefined
            }
        }
    }

    async getInfo(timeout_ms?: number): Promise<IIDNInfo | null> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.getInfo()",
        }

        Log.debug("Getting instrument information", LOGLOC)

        const args = [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "info",
            "--json",
            this.addr,
        ]

        if (this._keyring) {
            args.push("--keyring", this._keyring)
        }

        const backgroundProcess = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })

        this._background_process = backgroundProcess

        let timeoutHandle: NodeJS.Timeout | undefined

        if (timeout_ms !== undefined && timeout_ms > 0) {
            timeoutHandle = setTimeout(() => {
                if (this._background_process === backgroundProcess) {
                    this.terminateBackgroundProcess(backgroundProcess)
                }
            }, timeout_ms)
        }

        try {
            const info_string = await new Promise<string>((resolve) => {
                let data = ""

                backgroundProcess.stderr?.on("data", (chunk) => {
                    Log.trace(`Info stderr: ${chunk}`, LOGLOC)
                })

                backgroundProcess.stdout?.on("data", (chunk) => {
                    data += chunk
                })

                backgroundProcess.on("close", () => {
                    resolve(data)
                })
            })

            const exit_code = backgroundProcess.exitCode

            Log.trace(
                `Info process exited with code: ${exit_code}, information: ${info_string.trim()}`,
                LOGLOC,
            )

            if (info_string === "") {
                Log.error(
                    "Unable to connect to instrument, could not get instrument information",
                    LOGLOC,
                )
                return null
            }

            return <IIDNInfo>JSON.parse(info_string)
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }

            if (this._background_process === backgroundProcess) {
                this._background_process = undefined
            }
        }
    }

    async dumpOutputQueue(): Promise<string | undefined> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.dumpOutputQueue()",
        }

        let dump_path: string | undefined = undefined

        Log.info("Dumping data from instrument output queue", LOGLOC)

        const dump_dir = mkdtempSync(join(os.tmpdir(), "tsp-toolkit-"))
        dump_path = join(dump_dir, "dump-output")

        Log.trace(`Dumping data to ${dump_path}`, LOGLOC)

        const backgroundProcess = child.spawn(EXECUTABLE, [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "dump",
            this.addr,
            "--output",
            dump_path,
        ])

        this._background_process = backgroundProcess

        await new Promise<void>((resolve) => {
            backgroundProcess.on("close", () => {
                Log.trace(
                    `Dump process exited with code: ${backgroundProcess.exitCode}`,
                    LOGLOC,
                )

                if (this._background_process === backgroundProcess) {
                    this._background_process = undefined
                }

                resolve()
            })
        })

        return dump_path
    }

    async connect(
        name?: string,
        progressContext?: {
            progress: vscode.Progress<{ message?: string; increment?: number }>
            token: vscode.CancellationToken
        },
    ): Promise<boolean> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.connect()",
        }

        const orig_status = this.status
        //this.status = ConnectionStatus.Connected

        if (this._parent) {
            this._parent.savingTspOutput = false
        }

        if (!this._terminal) {
            Log.debug("Creating terminal", LOGLOC)

            if (progressContext) {
                return this.runConnectFlowWithTimeout(
                    name,
                    progressContext.progress,
                    progressContext.token,
                    orig_status,
                    LOGLOC,
                )
            }

            const result = await vscode.window.withProgress(
                {
                    cancellable: true,
                    location: vscode.ProgressLocation.Notification,
                    title: `Connecting to ${this.addr}`,
                },
                async (progress, cancel) =>
                    this.runConnectFlowWithTimeout(
                        name,
                        progress,
                        cancel,
                        orig_status,
                        LOGLOC,
                    ),
            )

            return result ?? false
        }

        this.showTerminal()
        return true
    }

    showTerminal() {
        if (this._terminal) {
            this._terminal.show()
        }
    }

    async reset() {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.reset()",
        }

        if (this._terminal) {
            Log.debug("Terminal exists, sending .reset", LOGLOC)
            this.showTerminal()
            this._terminal.sendText(".reset")
            return
        }

        if (this._background_process) {
            //wait for a background process slot to open up if it is busy
            Log.debug(
                "Terminal doesn't exist and background process is busy. Waiting...",
                LOGLOC,
            )

            await new Promise<void>((resolve) =>
                this._background_process?.on("close", () => resolve()),
            )

            Log.debug(
                "... Background process finished starting new reset call in background process",
                LOGLOC,
            )
        }

        const backgroundProcess = child.spawn(EXECUTABLE, [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "reset",
            this.addr,
        ])

        this._background_process = backgroundProcess

        await new Promise<void>((resolve) => {
            backgroundProcess.on("close", () => {
                Log.trace(
                    `Reset process exited with code: ${backgroundProcess.exitCode}`,
                    LOGLOC,
                )

                if (this._background_process === backgroundProcess) {
                    this._background_process = undefined
                }

                resolve()
            })
        })
    }

    async abort() {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.abort()",
        }

        if (this._terminal) {
            Log.debug("Terminal exists, sending .abort", LOGLOC)
            this.showTerminal()
            this._terminal.sendText(".abort")
            return
        }

        if (this._background_process) {
            //wait for a background process slot to open up if it is busy
            Log.debug(
                "Terminal doesn't exist and background process is busy. Waiting...",
                LOGLOC,
            )

            await new Promise<void>((resolve) =>
                this._background_process?.on("close", () => resolve()),
            )

            Log.debug(
                "... Background process finished starting new abort call in background process",
                LOGLOC,
            )
        }

        const backgroundProcess = child.spawn(EXECUTABLE, [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "abort",
            this.type.toLowerCase(),
            this.addr,
        ])

        this._background_process = backgroundProcess

        await new Promise<void>((resolve) => {
            backgroundProcess.on("close", () => {
                Log.trace(
                    `Abort process exited with code: ${backgroundProcess.exitCode}`,
                    LOGLOC,
                )

                if (this._background_process === backgroundProcess) {
                    this._background_process = undefined
                }

                resolve()
            })
        })
    }

    /**
     * Update the instrument that can be connected to by this Connection.
     *
     * If a connection does not already exist, create one and then send the appropriate
     * `.update` command.
     *
     * **Note:** This could be done using the `kic update` subcommand in the future. This method
     * was chosen to maintain any possible visual loading bars that may eventually be
     * printed to the terminal.
     *
     * @param filepath The path to the update file
     * @param slot (optional) The slot of the mainframe to update
     */
    async update(filepath: string, slot?: number) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.update()",
        }

        if (!this._terminal) {
            await this.connect()
        }

        Log.debug("Terminal exists, sending .update", LOGLOC)

        const fileSize = statSync(filepath).size

        if (fileSize === 0) {
            vscode.window.showErrorMessage("Firmware file is empty (0 bytes)")
            return
        }

        vscode.window.showInformationMessage(
            `Starting update on ${this._parent?.name}@${this._addr}${slot ? `, slot ${slot}` : ""}`,
        )

        this._terminal?.sendText(
            `.update ${slot ? `--slot ${slot}` : ""} "${filepath}"`,
        )
    }

    async startTspOutputSaving(output: string) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connections.startTspOutputSaving()",
        }

        if (!this._terminal) {
            await this.connect()
        }

        Log.debug(
            `Terminal exists, sending .save --tsp --output ${output}`,
            LOGLOC,
        )

        this._terminal?.sendText(`.save --tsp --output "${output}"`)
    }

    stopTspOutputSaving() {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connections.stopTspOutputSaving()",
        }

        if (!this._terminal) {
            return
        }

        Log.debug("Terminal exists, sending .save --end", LOGLOC)
        this._terminal.sendText(".save --end")
    }

    async saveBufferContents(
        buffers: string[],
        fields: string[],
        delimiter: string,
        output: string,
    ) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connections.saveBufferContents()",
        }

        if (!this._terminal) {
            await this.connect()
        }

        const command = `.save --buffer "${buffers.join('" --buffer "')}" --format "${fields.join(",")}" --delimiter "${delimiter}" --output "${output}"`

        Log.debug(`Terminal exists, sending ${command}`, LOGLOC)

        this._terminal?.sendText(command)
    }

    async saveScriptOutput(script: string, output: string) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connections.stopTspOutputSaving()",
        }

        if (!this._terminal) {
            await this.connect()
        }

        Log.debug(
            `Terminal exists, sending .save --script ${script} --output ${output}`,
            LOGLOC,
        )

        this._terminal?.sendText(
            `.save --script "${script}" --output "${output}"`,
        )
    }

    sendScript(filepath: string) {
        if (this._terminal) {
            this.showTerminal()
            this._terminal.sendText(`.script "${filepath}"`)
        }
    }

    async exitConnection() {
        if (this._terminal) {
            this._terminal.sendText(".exit")

            await new Promise<void>((resolve) => {
                const checkTerminal = setInterval(() => {
                    if (this._terminal === undefined) {
                        clearInterval(checkTerminal)
                        resolve()
                    }
                }, 100) // Check every 100ms
            })
        }
    }

    getNodes(filepath: string) {
        if (this._terminal) {
            this.showTerminal()

            this._terminal.sendText(
                `.nodes "${join(filepath, ".vscode/settings.json")}"`,
            )
        }
    }

    /**
     * NOT YET IMPLEMENTED IN KIC
     */
    //abort() {
    //    this._terminal?.sendText("")
    //    this._terminal?.sendText(".abort")
    //}

    /**
     * Update the connection status by checking whether the instrument is
     * still reachable.
     */
    async getUpdatedStatus(): Promise<void> {
        const info = await this.ping(1000)

        let new_status = ConnectionStatus.Inactive

        if (info?.serial_number === this._parent?.info.serial_number) {
            new_status = ConnectionStatus.Active
        }

        if (this.status !== new_status) {
            this.status = new_status
            this._onChangedStatus.fire(this.status)
        }
    }
}
