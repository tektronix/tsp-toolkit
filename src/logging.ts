import { appendFileSync, PathLike } from "node:fs"
import path from "node:path"
import { LOG_DIR } from "./utility"

enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
}

const LOGLEVEL_PAD = 5

function logLevelToString(level: LogLevel): string {
    switch (level) {
        case LogLevel.TRACE:
            return "TRACE"
        case LogLevel.DEBUG:
            return "DEBUG"
        case LogLevel.INFO:
            return "INFO"
        case LogLevel.WARN:
            return "WARN"
        case LogLevel.ERROR:
            return "ERROR"
    }
}
export class Log {
    /**
     * Write a trace-level log to the log file.
     *
     * @param msg The message to write to the log file
     * @param location The location in which the log took place
     */
    public static trace(msg: string, location: SourceLocation): void {
        Log.instance().writeln(new Date(), LogLevel.TRACE, msg, location)
    }

    /**
     * Write a debug-level log to the log file.
     *
     * @param msg The message to write to the log file
     * @param location The location in which the log took place
     */
    public static debug(msg: string, location: SourceLocation): void {
        Log.instance().writeln(new Date(), LogLevel.DEBUG, msg, location)
    }

    /**
     * Write an info-level log to the log file.
     *
     * @param msg The message to write to the log file
     * @param location The location in which the log took place
     */
    public static info(msg: string, location: SourceLocation): void {
        Log.instance().writeln(new Date(), LogLevel.INFO, msg, location)
    }

    /**
     * Write a warning-level log to the log file.
     *
     * @param msg The message to write to the log file
     * @param location The location in which the log took place
     */
    public static warn(msg: string, location: SourceLocation): void {
        Log.instance().writeln(new Date(), LogLevel.WARN, msg, location)
    }

    /**
     * Write a critical-level log to the log file.
     *
     * @param msg The message to write to the log file
     * @param location The location in which the log took place
     */
    public static error(msg: string, location?: SourceLocation): void {
        Log.instance().writeln(new Date(), LogLevel.ERROR, msg, location)
    }

    private date: Date
    private file: PathLike

    private static __instance: Log | undefined | null

    private static day_changed(file_date: Date): boolean {
        const file_year = file_date.getUTCFullYear()
        const file_month = file_date.getUTCMonth()
        const file_day = file_date.getUTCDate()

        const date = new Date(Date.now())
        const year = date.getUTCFullYear()
        const month = date.getUTCMonth()
        const day = date.getUTCDate()

        return file_year !== year || file_month !== month || file_day !== day
    }

    private static get_date(): Date {
        const date = new Date()
        const year = date.getUTCFullYear()
        const month = date.getUTCMonth()
        const day = date.getUTCDate()

        return new Date(year, month, day)
    }

    private static get_date_string(date: Date): string {
        return date.toISOString().substring(0, 10)
    }

    private static get_time(): Date {
        return new Date()
    }

    private static get_timestamp(): string {
        return Log.get_time().toISOString()
    }

    private static instance(): Log {
        if (!Log.__instance || Log.day_changed(Log.__instance.date)) {
            const date = Log.get_date()
            const file = path.join(
                LOG_DIR,
                `${Log.get_date_string(date)}-tsp-toolkit.log`,
            )

            Log.__instance = new Log(file, date)
        }

        return Log.__instance
    }

    private constructor(file: string, date: Date) {
        this.file = file
        this.date = date
    }

    private writeln(
        timestamp: Date,
        level: LogLevel,
        msg: string,
        location?: SourceLocation,
    ): void {
        //2024-10-15T12:34:56.789Z [INFO ] source-file.ts@Class.functionName: Some message to write to the log file
        const content = `${timestamp.toISOString()} [${logLevelToString(level).padEnd(LOGLEVEL_PAD, " ")}] ${toString(location)}${msg}\n`
        try {
            appendFileSync(this.file, content)
        } catch (err) {
            console.error(err)
        }
    }
}

export interface SourceLocation {
    file?: string
    func?: string
}

function toString(location?: SourceLocation) {
    if (!location) {
        return ""
    }
    if (location.file && location.func) {
        return `${location.file}@${location.func}: `
    }
    if (location.func) {
        return location.func + ": "
    }
    if (location.file) {
        return location.file + ": "
    }

    return ""
}
