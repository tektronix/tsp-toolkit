import { existsSync, mkdirSync, PathLike } from "node:fs"
import { homedir, platform, tmpdir } from "node:os"
import { basename, join } from "node:path"
import { env } from "node:process"
import vscode from "vscode"
import { ConnectionDetails } from "./resourceManager"

interface PathsInterface {
    data: PathLike
    config: PathLike
    cache: PathLike
    log: PathLike
    temp: PathLike
}

class Paths {
    readonly _data: string
    readonly _config: string
    readonly _cache: string
    readonly _log: string
    readonly _temp: string

    constructor(options: PathsInterface) {
        this._data = options.data.toString()
        this._config = options.config.toString()
        this._cache = options.cache.toString()
        this._log = options.log.toString()
        this._temp = options.temp.toString()
    }

    get data(): string {
        if (!existsSync(this._data)) {
            mkdirSync(this._data, { recursive: true })
        }
        return this._data
    }

    get config(): string {
        if (!existsSync(this._config)) {
            mkdirSync(this._config, { recursive: true })
        }
        return this._config
    }

    get cache(): string {
        if (!existsSync(this._cache)) {
            mkdirSync(this._cache, { recursive: true })
        }
        return this._cache
    }

    get log(): string {
        if (!existsSync(this._log)) {
            mkdirSync(this._log, { recursive: true })
        }
        return this._log
    }

    get temp(): string {
        if (!existsSync(this._temp)) {
            mkdirSync(this._temp, { recursive: true })
        }
        return this._temp
    }
}

// Paths referenced from https://github.com/sindresorhus/env-paths/blob/v3.0.0/index.js
// License:
//    MIT License
//
//    Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
//
//    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
//    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const PATHS: Paths = (function (app_name: string): Paths {
    switch (platform()) {
        case "win32": {
            const ad = env.APPDATA || join(homedir(), "AppData", "Roaming")
            const lad = env.LOCALAPPDATA || join(homedir(), "AppData", "Local")

            return new Paths({
                data: join(lad, app_name, "Data"),
                config: join(ad, app_name, "Config"),
                cache: join(lad, app_name, "Cache"),
                log: join(lad, app_name, "Log"),
                temp: join(tmpdir(), app_name),
            })
        }
        case "darwin": {
            const lib = join(homedir(), "Library")

            return new Paths({
                data: join(lib, app_name, "Application Support"),
                config: join(lib, app_name, "Preferences"),
                cache: join(lib, app_name, "Caches"),
                log: join(lib, app_name, "Logs"),
                temp: join(tmpdir(), app_name),
            })
        }
        case "linux": {
            const username = basename(homedir())
            return new Paths({
                data: join(
                    env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
                    app_name,
                ),
                config: join(
                    env.XDG_CONFIG_HOME || join(homedir(), ".config"),
                    app_name,
                ),
                cache: join(
                    env.XDG_CACHE_HOME || join(homedir(), ".cache"),
                    app_name,
                ),
                log: join(
                    env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
                    app_name,
                ),
                temp: join(tmpdir(), username, app_name),
            })
        }
        default: {
            return new Paths({
                data: join(homedir(), app_name, "data"),
                config: join(homedir(), app_name, "config"),
                cache: join(homedir(), app_name, "cache"),
                log: join(homedir(), app_name, "log"),
                temp: join(tmpdir(), app_name),
            })
        }
    }
})("tsp-toolkit")

const log_path = PATHS.log

export const isMacOS = platform() === "darwin"
/**
 * The appropriate location for user-level logs.
 * - **Windows**: C:\Users\USERNAME\AppData\Local\tsp-toolkit\Log
 * - **Linux**: ~/.local/state/tsp-toolkit
 * - **macOS**: ~/Library/Logs/tsp-toolkit
 */
export const LOG_DIR = log_path
export const COMMON_PATHS = PATHS

export interface TspToolkitApi {
    fetchKicTerminals(): vscode.Terminal[]
    fetchConnDetails(
        term_pid: Thenable<number | undefined> | undefined,
    ): Promise<ConnectionDetails | undefined>
    restartConnAfterDbg(details: ConnectionDetails): Promise<void>
}
