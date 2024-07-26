import { createServer, Server } from "net"
import { LogOutputChannel, window } from "vscode"

const PORT_MAX = 49150
const PORT_MIN = 48620

/**
 * The log levels from KIC applications.
 */
enum KicLogLevels {
    TRACE = "TRACE",
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
}

/**
 * This type is used in type-intersections to allow for more keys to be present in a
 * type.
 */
type OtherKeys = {
    [key: string]: string | number | boolean | object
}

/**
 * A span should always include a `name`, but there could be other keys that are
 * included as well. This type-intersection allows us to include other keys if they
 * exist.
 */
type Span = OtherKeys & {
    name: string
}

/**
 * Fields will likely include a `message`, though it is not guaranteed. There could be
 * other keys that are included as well. This type-intersection allows us to include
 * other keys if they exist.
 */
type Fields = OtherKeys & {
    message?: string
}

/**
 * KicLogMessage defines the JSON object we expect to get from the KIC application over
 * the logging socket.
 */
interface KicLogMessage {
    timestamp: string
    level: KicLogLevels
    fields: Fields
    target: string
    span: Span
    spans: Span[]
}

/**
 * A logger will create a socket server that listens for kic log messages and prints
 * them to the appropriate Output Channel.
 */
export class Logger {
    private _manager?: LoggerManager
    private _server: Server
    private _outputChannel: LogOutputChannel
    private _port: number

    readonly _name: string
    readonly _host: string

    constructor(
        name: string,
        host: string,
        port: number,
        manager?: LoggerManager
    ) {
        this._name = name
        this._host = host
        this._port = port
        if (manager) {
            this._manager = manager
        }

        this._outputChannel = window.createOutputChannel(this._name, {
            log: true,
        })

        this._server = createServer((stream) => {
            stream.on("data", (c) => {
                //console.log(c.toString())
                const raw = "[" + c.toString() + "]"
                const messages = JSON.parse(raw) as KicLogMessage[]

                for (const m of messages) {
                    const spans = m.spans
                        .map((x) => {
                            let span_string = ""
                            const { name, ...args } = x
                            span_string += name
                            if (Object.keys(args).length > 0) {
                                span_string += JSON.stringify(args)
                            }
                            return span_string
                        })
                        .join(":")

                    const fields = ((f: Fields): string => {
                        let msg_text = ""
                        if (f.message !== undefined) {
                            const { message, ...fields } = f
                            msg_text += message
                            if (Object.keys(fields).length > 0) {
                                msg_text =
                                    JSON.stringify(fields) + " " + msg_text
                            }
                        } else {
                            if (Object.keys(f).length > 0) {
                                msg_text += JSON.stringify(f)
                            }
                        }
                        return msg_text
                    })(m.fields)

                    const message = `${spans} ${m.target} ${fields}`

                    switch (m.level) {
                        case KicLogLevels.TRACE:
                            this._outputChannel.trace(message)
                            break
                        case KicLogLevels.DEBUG:
                            this._outputChannel.debug(message)
                            break
                        case KicLogLevels.INFO:
                            this._outputChannel.info(message)
                            break
                        case KicLogLevels.WARN:
                            this._outputChannel.warn(message)
                            break
                        case KicLogLevels.ERROR:
                            this._outputChannel.error(message)
                            break
                        default:
                            break
                    }
                }
            })

            stream.on("end", () => {
                this._server.close()
            })
        })

        this._server.on("close", () => {
            this._outputChannel.dispose()
            if (this._manager) {
                this._manager.remove_logger(this)
            }
        })

        this._server.on("error", (e) => {
            if (e.name === "EADDRINUSE") {
                setTimeout(() => {
                    this._server.close()
                    this._port++
                    if (this._port > PORT_MAX) {
                        this._outputChannel.appendLine(
                            "Unable to find a usable port number for logger."
                        )
                        return
                    }
                }, 500)
            }
        })

        this._server.listen(this._port, this._host, () => {
            console.log(
                `Logger for ${this._name} listening on ${this._host}:${this._port}`
            )
        })
    }

    get host(): string {
        return this._host
    }

    get port(): number {
        return this._port
    }
}

/**
 * A LoggerManager creates Loggers for the expected external applications (in this case
 * `kic` and `kic-discover`).
 */
export class LoggerManager {
    private _loggers: Map<string, Logger>
    private _next_port = PORT_MIN

    /**
     * The global singleton instance of LoggerManager.
     */
    private static INSTANCE: LoggerManager | undefined

    /**
     * Get the singleton instance of the LoggerManager.
     */
    static instance(): LoggerManager {
        if (!LoggerManager.INSTANCE) {
            LoggerManager.INSTANCE = new LoggerManager()
        }
        return LoggerManager.INSTANCE
    }

    private constructor() {
        this._loggers = new Map<string, Logger>()
        this.add_logger("TSP Discovery")
        this.add_logger("TSP Terminal")
    }

    /**
     * Add a new Logger with the given name. All Loggers created here will use a host IP
     * of `127.0.0.1`. The port will be incremented between each added logger, so always
     * get the port number programmatically. There is no guarantees on the final port
     * number of any Logger.
     */
    add_logger(name: string): Logger {
        if (this._loggers.has(name) && this._loggers.get(name) !== undefined) {
            return this._loggers.get(name) ?? process.exit(1) // should not be able to get here because of the if statement
        }

        const logger = new Logger(name, "127.0.0.1", this._next_port, this)
        this._next_port = logger.port + 1
        if (this._next_port > PORT_MAX) {
            this._next_port = PORT_MIN
        }
        this._loggers.set(name, logger)
        return logger
    }

    /**
     * Remove a Logger by name or by object.
     */
    remove_logger(logger: Logger | string) {
        if (typeof logger === "string") {
            this._loggers.delete(logger)
            return
        }

        for (const [k, v] of this._loggers) {
            if (v === logger) {
                this._loggers.delete(k)
            }
        }
    }
}
