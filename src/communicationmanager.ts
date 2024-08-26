import { join } from "node:path"
import * as vscode from "vscode"
import { EXECUTABLE } from "./kic-cli"
import {
    CONNECTION_RE,
    ConnectionHelper,
    KicProcessMgr,
} from "./resourceManager"
import { createTerminal } from "./extension"

export class CommunicationManager {
    public connectionRE = /(?:(\w+)@)?(\d+.*)/
    private _kicProcessMgr: KicProcessMgr
    private _connHelper: ConnectionHelper

    constructor(
        context: vscode.ExtensionContext,
        kicProcessMgr: KicProcessMgr,
        conneHelper: ConnectionHelper,
    ) {
        this._connHelper = conneHelper
        this._kicProcessMgr = kicProcessMgr
        const rclick = vscode.commands.registerCommand(
            "tsp.sendFile",
            async (e) => {
                await this.sendScript(e)
            },
        )
        const configureTspLanguage = vscode.commands.registerCommand(
            "tsp.configureTspLanguage",
            async (e) => {
                await this.fetchAndUpdateInstrumentTspLinkConfiguration(e)
            },
        )
        const kic_openterminal = vscode.window.onDidOpenTerminal(
            async () => await this.terminalAction(),
        )
        const kic_closeterminal = vscode.window.onDidCloseTerminal(
            async (e) => await this.handleTerminalCloseAction(e),
        )
        const sendFileToAllInstr = vscode.commands.registerCommand(
            "tsp.sendFileToAllInstr",
            (e) => {
                this.sendScriptToAllInstruments(e)
            },
        )
        context.subscriptions.push(kic_openterminal)
        context.subscriptions.push(kic_closeterminal)
        context.subscriptions.push(rclick)
        context.subscriptions.push(sendFileToAllInstr)
        context.subscriptions.push(configureTspLanguage)
    }

    // Sends script to terminal
    private async sendScript(_e: unknown) {
        const uriObject = _e as vscode.Uri
        const filePath = `.script "${uriObject.fsPath}"`
        await this.handleSendTextToTerminal(filePath).then(() => {
            void vscode.window.showInformationMessage(
                "Sending script to terminal",
            )
        })
    }

    /**
     * Sends script to all active terminals
     * active terminals are terminals with instrument connection
     * this command is enabled when there is more than one instrument connected
     */
    private sendScriptToAllInstruments(_e: unknown) {
        const uriObject = _e as vscode.Uri
        const filePath = `.script "${uriObject.fsPath}"`
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })

        kicTerminals.forEach((term) => {
            term.sendText(filePath)
        })
    }
    /**
     * Pass command line argument to active terminal for getting node details
     * from active terminal, if no connected terminal is available then it will ask
     * for connection, if multiple terminal are available then it will ask for select one
     * @param _e command event
     */
    private async fetchAndUpdateInstrumentTspLinkConfiguration(_e: unknown) {
        const uriObject = _e as vscode.Uri
        const text = `.nodes "${join(uriObject.fsPath, "config.tsp.json")}"`
        await this.handleSendTextToTerminal(text)
        void vscode.window.showInformationMessage(
            "Fetching and Updating Instrument tspLink Configuration",
        )
    }

    /**
     * Handle send text workflow for connected instruments
     * @param text command text that needs to pass to the terminal
     */
    private async handleSendTextToTerminal(text: string): Promise<boolean> {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })

        if (kicTerminals.length === 0) {
            const options: vscode.InputBoxOptions = {
                prompt: "No instrument found, do you want to connect?",
                value: "Yes",
            }
            const res = await vscode.window.showInputBox(options)
            if (res?.toUpperCase() === "YES") {
                const options: vscode.InputBoxOptions = {
                    prompt: "Enter instrument IP in <insName>@<IP> format",
                    validateInput: this._connHelper.instrIPValidator,
                }
                const Ip = await vscode.window.showInputBox(options)

                if (Ip == undefined) {
                    return Promise.reject(new Error("IP is undefined"))
                }

                const msn = await this._connHelper.getModelAndSerialNumber(Ip)
                if (msn != undefined) {
                    void vscode.window.showInformationMessage(
                        Ip +
                            ": Found instrument model " +
                            msn.model +
                            " with S/N: " +
                            msn.sn,
                    )
                    await createTerminal(Ip, msn.model, text)
                    return Promise.resolve(true)
                }
            }
        } else if (kicTerminals.length === 1) {
            kicTerminals[0].sendText(text)
            return Promise.resolve(true)
        } else if (kicTerminals.length > 1) {
            const options: vscode.InputBoxOptions = {
                prompt: "Multiple instruments are connected!,\nPress enter to see all the active connections and select one from that",
                value: "Ok",
            }
            const kicDict: { [name: string]: vscode.Terminal } = {}

            kicTerminals.forEach((t) => {
                const k: string =
                    t.name +
                        "@" +
                        (
                            (t.creationOptions as vscode.TerminalOptions)
                                ?.shellArgs as string[]
                        )[1] ?? ""
                kicDict[k] = t
            })
            if ((await vscode.window.showInputBox(options)) != undefined) {
                const selectedTerm = await vscode.window.showQuickPick(
                    Object.keys(kicDict),
                )
                if (selectedTerm != undefined) {
                    kicDict[selectedTerm]?.sendText(text)
                    return Promise.resolve(true)
                }
            }
        }

        return Promise.reject(new Error("Unknown error"))
    }

    //this is the main create

    /**
     * Creates a kic terminal for given instrument connection details
     * @param term_name - terminal/connection name
     * @param instrumentIp - instrument IP address (Lan only)
     * @param usb_unique_string - unique string for USB connection (USB only)
     * @param filePath - file path to send to terminal
     * @returns A tuple where the first element (string) is the *idn? info
     * and the second element (string | undefined) is system generated unique connection name if term_name is empty
     */
    public createTerminal(
        term_name: string,
        instrumentIp?: string,
        usb_unique_string?: string,
        filePath?: string,
    ): [info: string, verified_name?: string] {
        let res: [string, string?] = ["", undefined]
        const maxerr: number =
            vscode.workspace.getConfiguration("tsp").get("errorLimit") ?? 0
        if (instrumentIp != undefined) {
            const parts = instrumentIp.match(CONNECTION_RE)
            if (parts == null) return ["", undefined]
            const ip_addr = parts[2]
            const ip = ip_addr.split(":")[0] //take only IPv4 address, don't include socket.

            /*
        //If for UX reason we need to have unique named terminals we can use this code
        if (this.checkForDuplicateTermName(name)) {
            void vscode.window.showWarningMessage(
                'Terminal name already exists, appending "(new)" to the name, please provide unique terminal names'
            )
            name += "(new)"
        }*/
            // term = vscode.window.createTerminal({
            //     name: name,
            //     shellPath: EXECUTABLE,
            //     shellArgs: [
            //         "connect",
            //         "lan",
            //         ip,
            //         "--max-errors",
            //         maxerr.toString(),
            //     ],
            //     iconPath: vscode.Uri.file("/keithley-logo.ico"),
            // })

            res = this._kicProcessMgr.createKicCell(
                term_name,
                ip,
                "lan",
                maxerr,
                filePath,
            )
        } else if (usb_unique_string != undefined) {
            let unique_string = usb_unique_string
            const string_split = usb_unique_string.split("@")
            if (string_split.length > 1) {
                unique_string = string_split[1]
            }
            res = this._kicProcessMgr.createKicCell(
                term_name,
                unique_string,
                "usb",
                undefined,
                filePath,
            )
        }

        // if (term != undefined) {
        //     term.show()
        //     if (filePath != undefined) {
        //         term.sendText(filePath)
        //     }
        // }
        return res
    }

    private async terminalAction() {
        const kicTerminals = vscode.window.terminals.filter(
            (t) =>
                (
                    t.creationOptions as vscode.TerminalOptions
                )?.shellPath?.toString() === EXECUTABLE,
        )
        await vscode.commands.executeCommand(
            "setContext",
            "isKicTerminalActive",
            kicTerminals.length > 1,
        )
    }

    private async handleTerminalCloseAction(e: vscode.Terminal) {
        const index_arr: number[] = []

        this._kicProcessMgr.kicList.forEach((kicCell, idx) => {
            if (kicCell.terminalPid == e.processId) {
                kicCell.isTerminalClosed = true
                //#ToDo: is the next line needed?
                //kicCell.writeToChild(".exit\n")
                index_arr.push(idx)
            }
        })

        index_arr.forEach((i) => {
            this._kicProcessMgr.kicList.splice(i, 1)
        })

        const kicTerminals = vscode.window.terminals.filter(
            (t) =>
                (
                    t.creationOptions as vscode.TerminalOptions
                )?.shellPath?.toString() === EXECUTABLE,
        )
        await vscode.commands.executeCommand(
            "setContext",
            "isKicTerminalActive",
            kicTerminals.length > 1,
        )
    }

    // private checkForDuplicateTermName(input: string): boolean {
    //     const kicTerminals = vscode.window.terminals.filter(
    //         (t) =>
    //             (
    //                 t.creationOptions as vscode.TerminalOptions
    //             )?.shellPath?.toString() === EXECUTABLE
    //     )
    //     for (const x of kicTerminals) {
    //         if (x.name == input) {
    //             return true
    //         }
    //     }
    //     return false
    // }
}
