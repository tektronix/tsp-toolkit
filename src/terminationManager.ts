import path = require("node:path")
import * as vscode from "vscode"
import { EXECUTABLE } from "@tektronix/kic-cli"

import { CONNECTION_RE } from "./resourceManager"
import { LOG_DIR } from "./utility"
import { LoggerManager } from "./logging"

export class TerminationManager {
    async terminateAllConn() {
        const kicTerminals = vscode.window.terminals.filter(
            (t) =>
                (
                    t.creationOptions as vscode.TerminalOptions
                )?.shellPath?.toString() === EXECUTABLE
        )
        if (kicTerminals.length == 0) {
            const options: vscode.InputBoxOptions = {
                prompt: "No instrument found to terminate, do you want to enter the IP?",
                value: "Yes",
            }
            const res = await vscode.window.showInputBox(options)
            if (res?.toUpperCase() == "YES") {
                const options: vscode.InputBoxOptions = {
                    prompt: "Enter instrument IP to terminate",
                }
                const Ip = await vscode.window.showInputBox(options)
                //console.log(Ip)
                this.createTerminal(Ip as string)
            }
        } else if (kicTerminals.length == 1) {
            kicTerminals[0].sendText(".terminate")
        } else if (kicTerminals.length > 1) {
            const options: vscode.InputBoxOptions = {
                prompt: "Multiple instruments are connected!,\nPress enter to see all the active connections and select one from that",
                value: "Ok",
            }
            const kicDict: { [name: string]: vscode.Terminal } = {}

            kicTerminals.forEach((t) => {
                const k: string =
                    t.name +
                        ":" +
                        (
                            (t.creationOptions as vscode.TerminalOptions)
                                ?.shellArgs as string[]
                        )[1] ?? ""
                kicDict[k] = t
            })
            if ((await vscode.window.showInputBox(options)) != undefined) {
                const selectedTerm = await vscode.window.showQuickPick(
                    Object.keys(kicDict)
                )
                if (selectedTerm != undefined) {
                    kicDict[selectedTerm]?.sendText(".terminate")
                }
            }
        }
    }

    createTerminal(instrumentIp: string) {
        const parts = instrumentIp.match(CONNECTION_RE)
        if (parts == null) return
        const name = typeof parts[1] == "undefined" ? "KIC" : parts[1]
        const ip = parts[2]

        const logger = LoggerManager.instance().add_logger("TSP Terminal")

        const term = vscode.window.createTerminal({
            name: name,
            shellPath: EXECUTABLE,
            shellArgs: [
                "--log-file",
                path.join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`
                ),
                "--log-socket",
                `${logger.host}:${logger.port}`,
                "terminate",
                "lan",
                ip,
            ],
            iconPath: vscode.Uri.file("/keithley-logo.ico"),
        })
        term.show()
    }
}
