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
import { checkVisaInstallation, checkVisaInstallationLinux, isLinux, isWindows } from "./dependencyChecker"

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
     * This connection interface was deemed connected and already has a terminal associated with it
     */
    Connected,
}

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
        case ConnectionStatus.Connected:
            return "Connected"
    }
}
export function contextValueStatus(
    contextValue: string,
    status: ConnectionStatus | undefined,
): string {
    if (contextValue.match(/Connected|Active|Inactive/)) {
        return contextValue.replace(
            /Connected|Active|Inactive/,
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
        }
        if (this._background_process) {
            if (os.platform() === "win32" && this._background_process.pid) {
                // The following was the only configuration of options found to work.
                // Do NOT remove the `/F` unless you have rigorously proven that it
                // consistently works.
                child.spawnSync("TaskKill", [
                    "/PID",
                    this._background_process.pid.toString(),
                    "/T", // Terminate the specified process and any child processes
                    "/F", // Forcefully terminate the specified processes
                ])
            } else {
                this._background_process.kill("SIGINT")
            }
        }
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

    async checkLogin(timeout_ms?: number): Promise<{
        username: boolean
        password: boolean
        keyring?: string
    } | null> {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.checkLogin()",
        }
        Log.debug("Checking if instrument requires login", LOGLOC)

        this._background_process = child.spawn(
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
        if (timeout_ms) {
            setTimeout(() => {
                if (
                    os.platform() === "win32" &&
                    this._background_process?.pid
                ) {
                    // The following was the only configuration of options found to work.
                    // Do NOT remove the `/F` unless you have rigorously proven that it
                    // consistently works.
                    child.spawnSync("TaskKill", [
                        "/PID",
                        this._background_process.pid.toString(),
                        "/T", // Terminate the specified process and any child processes
                        "/F", // Forcefully terminate the specified processes
                    ])
                } else {
                    this._background_process?.kill("SIGINT")
                }
            }, timeout_ms)
        }
        const requirements = await new Promise<{
            username: boolean
            password: boolean
            keyring?: string
        } | null>((resolve) => {
            let data = ""
            this._background_process?.stderr?.on("data", (chunk) => {
                Log.trace(`Info stderr: ${chunk}`, LOGLOC)
            })
            this._background_process?.stdout?.on("data", (chunk) => {
                data += chunk
            })
            this._background_process?.on("close", (code) => {
                const ret: {
                    username: boolean
                    password: boolean
                    keyring?: string
                } = {
                    username: false,
                    password: false,
                    keyring: undefined,
                }
                if (code != 0) {
                    if (data.length === 0) {
                        resolve(null)
                        return
                    }
                    const d = data.toString()
                    const [, details] = d.split(": ")
                    const reqs = details.split(",")
                    if (
                        (reqs.length > 1 && d.search(/USERNAME/g) === -1) ||
                        reqs.length > 2
                    ) {
                        ret.keyring = reqs[reqs.length - 1].trim()
                    }

                    ret.password = true
                    if (d.search(/USERNAME/g) !== -1) {
                        ret.username = true
                    }
                }
                resolve(ret)
            })
        })

        const exit_code = this._background_process.exitCode

        this._background_process = undefined

        Log.trace(
            `Info process exited with code: ${exit_code}, requirements: ${JSON.stringify(requirements)}`,
            LOGLOC,
        )

        return requirements
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

        if (reqs.username) {
            credentials.username = await vscode.window.showInputBox({
                title: "Enter Username",
                placeHolder: "username",
                prompt: "Enter the username for the instrument to which you are trying to connect.",
            })
        }

        if (reqs.password) {
            credentials.password = await vscode.window.showInputBox({
                title: "Enter Password",
                placeHolder: "password",
                password: true,
                prompt: "Enter the password for the instrument to which you are trying to connect.",
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
        const LOGLOC = { file: "instruments.ts", func: "Connection.login()" }
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

        this._background_process = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })

        const keyring_id = await new Promise<string>((resolve) => {
            let data = ""
            this._background_process?.stderr?.on("data", (chunk) => {
                Log.trace(`Info stderr: ${chunk}`, LOGLOC)
            })
            this._background_process?.stdout?.on("data", (chunk) => {
                data += chunk
            })
            this._background_process?.on("close", () => {
                resolve(data.trim())
            })
        })

        const exit_code = this._background_process.exitCode

        this._background_process = undefined

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
    }

    async ping(timeout_ms?: number): Promise<IIDNInfo | null> {
        const LOGLOC = { file: "instruments.ts", func: "Connection.ping()" }
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

        this._background_process = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })
        if (timeout_ms) {
            setTimeout(() => {
                if (
                    os.platform() === "win32" &&
                    this._background_process?.pid
                ) {
                    // The following was the only configuration of options found to work.
                    // Do NOT remove the `/F` unless you have rigorously proven that it
                    // consistently works.
                    child.spawnSync("TaskKill", [
                        "/PID",
                        this._background_process.pid.toString(),
                        "/T", // Terminate the specified process and any child processes
                        "/F", // Forcefully terminate the specified processes
                    ])
                } else {
                    this._background_process?.kill("SIGINT")
                }
            }, timeout_ms)
        }
        const info_string = await new Promise<string | null>((resolve) => {
            let data = ""
            this._background_process?.stderr?.on("data", (chunk) => {
                Log.trace(`Info stderr: ${chunk}`, LOGLOC)
            })
            this._background_process?.stdout?.on("data", (chunk) => {
                data += chunk
            })
            this._background_process?.on("close", (code) => {
                if (code === 0) {
                    resolve(data)
                }
                resolve(null)
            })
        })

        if (!info_string) {
            return null
        }

        const exit_code = this._background_process.exitCode

        this._background_process = undefined

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
    }

    async getInfo(timeout_ms?: number): Promise<IIDNInfo | null> {
        const LOGLOC = { file: "instruments.ts", func: "Connection.getInfo()" }
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

        this._background_process = child.spawn(EXECUTABLE, args, {
            env: { CLICOLOR: "1", CLICOLOR_FORCE: "1" },
        })
        if (timeout_ms) {
            setTimeout(() => {
                if (
                    os.platform() === "win32" &&
                    this._background_process?.pid
                ) {
                    // The following was the only configuration of options found to work.
                    // Do NOT remove the `/F` unless you have rigorously proven that it
                    // consistently works.
                    child.spawnSync("TaskKill", [
                        "/PID",
                        this._background_process.pid.toString(),
                        "/T", // Terminate the specified process and any child processes
                        "/F", // Forcefully terminate the specified processes
                    ])
                } else {
                    this._background_process?.kill("SIGINT")
                }
            }, timeout_ms)
        }
        const info_string = await new Promise<string>((resolve) => {
            let data = ""
            this._background_process?.stderr?.on("data", (chunk) => {
                Log.trace(`Info stderr: ${chunk}`, LOGLOC)
            })
            this._background_process?.stdout?.on("data", (chunk) => {
                data += chunk
            })
            this._background_process?.on("close", () => {
                resolve(data)
            })
        })

        const exit_code = this._background_process.exitCode

        this._background_process = undefined

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

        this._background_process = child.spawn(EXECUTABLE, [
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

        await new Promise<void>((resolve) => {
            this._background_process?.on("close", () => {
                Log.trace(
                    `Dump process exited with code: ${this._background_process?.exitCode}`,
                    LOGLOC,
                )
                this._background_process = undefined
                resolve()
            })
        })
        return dump_path
    }

    async connect(name?: string) {
        const LOGLOC = { file: "instruments.ts", func: "Connection.connect()" }
        const orig_status = this.status
        this.status = ConnectionStatus.Connected
        
        // Check VISA availability if connecting via VISA protocol
        if (this._type === IoType.Visa) {
            const ignoreMissingVisa = vscode.workspace.getConfiguration("tsp").get<boolean>("ignoreMissingVisa", false)
            
            if (!ignoreMissingVisa) {
                let hasVisa = false
                if (isWindows) {
                    hasVisa = await checkVisaInstallation()
                } else if (isLinux) {
                    hasVisa = await checkVisaInstallationLinux()
                } else {
                    // macOS or other platforms - assume VISA not available
                    hasVisa = false
                }
                
                if (!hasVisa) {
                    Log.error("VISA not installed but required for this connection", LOGLOC)
                    this.status = orig_status
                    await vscode.window.showErrorMessage(
                        "VISA is not installed on your system. Please install VISA to use this connection method, or switch to LAN/USB protocol.",
                        "Download VISA",
                        "Close"
                    ).then((selection) => {
                        if (selection === "Download VISA") {
                            vscode.env.openExternal(vscode.Uri.parse("https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html"))
                        }
                    })
                    return
                }
            }
        }
        
        if (!this._terminal) {
            Log.debug("Creating terminal", LOGLOC)
            await vscode.window.withProgress(
                {
                    cancellable: true,
                    location: vscode.ProgressLocation.Notification,
                    title: "Connecting to instrument",
                },
                async (progress, cancel) => {
                    this.status = ConnectionStatus.Connected

                    cancel.onCancellationRequested(() => {
                        Log.info("Connection cancelled by user", LOGLOC)
                        if (this._background_process) {
                            this._background_process?.kill("SIGTERM")
                        }
                        this.status = ConnectionStatus.Active
                    })
                    //Dump output queue if enabled
                    if (cancel.isCancellationRequested) {
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
                    }
                    let dump_path = undefined
                    if (
                        vscode.workspace
                            .getConfiguration("tsp")
                            .get("dumpQueueOnConnect") === true
                    ) {
                        progress.report({
                            message:
                                "Dumping data from instrument output queue",
                        })
                        dump_path = await this.dumpOutputQueue()
                    }

                    progress.report({
                        message:
                            "Checking if instrument requires authentication",
                    })

                    if (cancel.isCancellationRequested) {
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
                    }

                    const login_required = await this.checkLogin()

                    if (login_required !== null) {
                        for (let i = 1; i <= 3; i++) {
                            //TODO: Prompt for the required information (if any)
                            if (i > 1 && login_required.keyring) {
                                login_required.keyring = undefined
                            }

                            progress.report({
                                message: `Attempt ${i} of 3: Prompting for instrument authentication details`,
                            })
                            const login_details =
                                await this.promptDetails(login_required)

                            this._keyring = await this.login(login_details)
                            if (this._keyring !== undefined) {
                                // null indicates login was not necessary, though we shouldn't get null
                                break
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
                        return new Promise((resolve) => resolve(false))
                    }
                    //Get instrument info
                    progress.report({
                        message: "Getting instrument information",
                    })
                    if (cancel.isCancellationRequested) {
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
                    }

                    const info = await this.ping()

                    if (!info) {
                        vscode.window.showErrorMessage(
                            `Unable to connect to instrument at ${this.addr}: could not get instrument information`,
                        )
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
                    }

                    if (!this._parent) {
                        this._parent = new Instrument(
                            info,
                            name !== "" ? name : undefined,
                        )
                        this._parent.addConnection(this)
                    }
                    InstrumentProvider.instance.addOrUpdateInstrument(
                        this._parent,
                    )
                    await InstrumentProvider.instance.saveInstrument(
                        this._parent,
                    )
                    this.status = ConnectionStatus.Connected

                    const additional_terminal_args = []

                    if (dump_path) {
                        additional_terminal_args.push(
                            "--dump-output",
                            dump_path,
                        )
                    }

                    progress.report({
                        message: `Connecting to instrument with model ${info.model} and S/N ${info.serial_number}`,
                    })

                    //Connect terminal
                    if (cancel.isCancellationRequested) {
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
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

                    if (additional_terminal_args) {
                        for (const a of additional_terminal_args) {
                            terminal_args.push(a)
                        }
                    }

                    if (this._keyring) {
                        terminal_args.push("--keyring", this._keyring)
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

                    this._terminal?.show(false)
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
                                t.exitStatus?.reason !==
                                vscode.TerminalExitReason.Process
                            ) {
                                setTimeout(() => {
                                    Log.debug(
                                        "Resetting closed instrument",
                                        LOGLOC,
                                    )
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
                },
            )
        } else {
            this.showTerminal()
        }
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
            this._terminal?.sendText(".reset")
            return
        }
        if (this._background_process) {
            //wait for a background process slot to open up if it is busy
            Log.debug(
                "Terminal doesn't exist and background process is busy. Waiting...",
                LOGLOC,
            )
            await new Promise<void>((r) =>
                this._background_process?.on("close", () => r()),
            )
            Log.debug(
                "... Background process finished starting new reset call in background process",
                LOGLOC,
            )
        }
        this._background_process = child.spawn(EXECUTABLE, [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "reset",
            this.addr,
        ])

        await new Promise<void>((resolve) => {
            this._background_process?.on("close", () => {
                Log.trace(
                    `Reset process exited with code: ${this._background_process?.exitCode}`,
                    LOGLOC,
                )
                this._background_process = undefined
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
            this._terminal?.sendText(".abort")
            return
        }
        if (this._background_process) {
            //wait for a background process slot to open up if it is busy
            Log.debug(
                "Terminal doesn't exist and background process is busy. Waiting...",
                LOGLOC,
            )
            await new Promise<void>((r) =>
                this._background_process?.on("close", () => r()),
            )
            Log.debug(
                "... Background process finished starting new abort call in background process",
                LOGLOC,
            )
        }
        this._background_process = child.spawn(EXECUTABLE, [
            "--log-file",
            join(
                LOG_DIR,
                `${new Date().toISOString().substring(0, 10)}-kic.log`,
            ),
            "abort",
            this.type.toLowerCase(),
            this.addr,
        ])

        await new Promise<void>((resolve) => {
            this._background_process?.on("close", () => {
                Log.trace(
                    `Abort process exited with code: ${this._background_process?.exitCode}`,
                    LOGLOC,
                )
                this._background_process = undefined
                resolve()
            })
        })
    }

    /**
     * Upgrade the instrument that can be connected to by this Connection.
     *
     * If a connection does not already exist, create one and then send the appropriate
     * `.upgrade` command.
     *
     * **Note:** This could be done using the `kic upgrade` subcommand in the future. This method
     * was chosen to maintain any possible visual loading bars that may eventually be
     * printed to the terminal
     *
     * @param filepath The path to the upgrade file
     * @param slot (optional) The slot of the mainframe to upgrade
     */
    async upgrade(filepath: string, slot?: number) {
        const LOGLOC = {
            file: "instruments.ts",
            func: "Connection.upgrade()",
        }
        if (!this._terminal) {
            await this.connect()
        }
        Log.debug("Terminal exists, sending .upgrade", LOGLOC)

        const fileSize = statSync(filepath).size
        if (fileSize === 0) {
            vscode.window.showErrorMessage("Firmware file is empty (0 bytes)")
            return
        }

        vscode.window.showInformationMessage(
            `Starting upgrade on ${this._parent?.name}@${this._addr}${slot ? `, slot ${slot}` : ""}`,
        )
        this._terminal?.sendText(
            `.upgrade ${slot ? `--slot ${slot}` : ""} "${filepath}"`,
        )
        return
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
        this._terminal?.sendText(".save --end")
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

    async sendScript(filepath: string) {
        if (!this._terminal) {
            await this.connect()
        }
        this.showTerminal()
        this._terminal?.sendText(`.script "${filepath}"`)
    }

    async connectAndExit() {
        if (!this._terminal) {
            await this.connect()
        }
        this.showTerminal()
        this._terminal?.sendText(".exit")
        await new Promise<void>((resolve) => {
            const checkTerminal = setInterval(() => {
                if (this._terminal === undefined) {
                    clearInterval(checkTerminal)
                    resolve()
                }
            }, 100) // Check every 100ms
        })
    }

    async getNodes(filepath: string) {
        if (!this._terminal) {
            await this.connect()
        }

        this.showTerminal()
        this._terminal?.sendText(
            `.nodes "${join(filepath, ".vscode/settings.json")}"`,
        )
    }

    /**
     * NOT YET IMPLEMENTED IN KIC
     */
    //abort() {
    //    this._terminal?.sendText("")
    //    this._terminal?.sendText(".abort")
    //}

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
