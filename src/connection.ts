import * as os from "os"
import * as child from "child_process"
import { join } from "path"
import { mkdtempSync } from "fs"
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

    get addr(): string {
        return this._addr
    }

    get status(): ConnectionStatus | undefined {
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

    async getInfo(timeout_ms?: number): Promise<IIDNInfo | null> {
        const LOGLOC = { file: "instruments.ts", func: "Connection.getInfo()" }
        Log.debug("Getting instrument information", LOGLOC)

        this._background_process = child.spawn(
            EXECUTABLE,
            [
                "--log-file",
                join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`,
                ),
                "info",
                this.type.toLowerCase(),
                "--json",
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
                `Unable to connect to instrument at ${this.addr}: could not get instrument information`,
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
            this.type.toLowerCase(),
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
        this.status = ConnectionStatus.Connected
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

                    //Get instrument info
                    progress.report({
                        message: "Getting instrument information",
                    })
                    if (cancel.isCancellationRequested) {
                        this.status = ConnectionStatus.Active
                        return new Promise((resolve) => resolve(false))
                    }

                    const info = await this.getInfo()

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
                        this.type.toLowerCase(),
                        this.addr,
                    ]

                    if (additional_terminal_args) {
                        for (const a of additional_terminal_args) {
                            terminal_args.push(a)
                        }
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
                        this.status = ConnectionStatus.Active
                        this._terminal = undefined
                        if (
                            t.creationOptions.iconPath !== undefined &&
                            // eslint-disable-next-line @typescript-eslint/no-base-to-string
                            t.creationOptions.iconPath
                                .toString()
                                .search("tsp-terminal-icon")
                        ) {
                            setTimeout(() => {
                                Log.debug("Resetting closed instrument", LOGLOC)
                                this.reset().catch(() => {})
                                this.status = ConnectionStatus.Active
                            }, 500)
                        }
                    })

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
            this.type.toLowerCase(),
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
        vscode.window.showInformationMessage(
            `Starting upgrade on ${this._parent?.name}@${this._addr}${slot ? `, slot ${slot}` : ""}`,
        )
        this._terminal?.sendText(
            `.upgrade ${slot ? `--slot ${slot}` : ""} "${filepath}"`,
        )
        return
    }

    async sendScript(filepath: string) {
        if (!this._terminal) {
            await this.connect()
        }
        this._terminal?.sendText(`.script "${filepath}"`)
    }

    /**
     * NOT YET IMPLEMENTED IN KIC
     */
    //abort() {
    //    this._terminal?.sendText("")
    //    this._terminal?.sendText(".abort")
    //}

    async getUpdatedStatus(): Promise<void> {
        const info = await this.getInfo(1000)
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
