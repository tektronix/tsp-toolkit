import * as vscode from "vscode"
import { ConnectionDetails, ConnectionHelper } from "./resourceManager"

export class CommunicationManager {
    public connectionRE = /(?:(\w+)@)?(\d+.*)/
    public InstrDetails: ConnectionDetails | undefined
    public doReconnect = false

    public async connDetailsForFirstInstr(): Promise<void> {
        //return new ConnectionDetails("", connAddr, connType)
        const options: vscode.InputBoxOptions = {
            prompt: "Enter instrument IP in <insName>@<IP> format",
            validateInput: ConnectionHelper.instrConnectionStringValidator,
        }
        const ip = await vscode.window.showInputBox(options)
        if (ip === undefined) {
            return Promise.reject(new Error("connection unsuccessful."))
        }

        this.doReconnect = false

        this.InstrDetails = ConnectionHelper.parseConnectionString(ip)
    }
}
