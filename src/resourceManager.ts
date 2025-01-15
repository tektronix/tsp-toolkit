import * as vscode from "vscode"

export const CONNECTION_RE =
    /(?:([A-Za-z0-9_\-+.]*)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
//export const IPV4_ADDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/

//interface for *idn? response
export interface IIDNInfo {
    vendor: string
    model: string
    serial_number: string
    firmware_rev: string
}

export function idn_to_string(idn: IIDNInfo): string {
    return `Model: ${idn.model} SN: ${idn.serial_number} FW: ${idn.firmware_rev}`
}

export enum IoType {
    Lan = "Lan",
    Visa = "Visa",
}

export function toIoType(str: string): IoType {
    switch (str.toUpperCase().trim()) {
        case "LAN":
            return IoType.Lan
        case "VISA":
            return IoType.Visa
        default:
            throw Error(`Unknown IoType "${str.trim()}"`)
    }
}

/**
 * io_type - Lan, Usb etc.
 * instr_address - connection address of instrument
 * instr_categ - versatest, tti, 26xx etc.
 */

interface IInstrInfo {
    io_type: IoType
    instr_address: string
    manufacturer: string
    model: string
    serial_number: string
    firmware_revision: string
    instr_categ: string
    socket_port?: string
}

export class InstrInfo implements IInstrInfo {
    io_type = IoType.Lan
    instr_address = ""
    manufacturer = ""
    model = ""
    serial_number = ""
    firmware_revision = ""
    instr_categ = ""
    friendly_name = ""
    socket_port?: string | undefined
}

//name: friendly name
//ip: address of instrument
export class FriendlyNameMgr {
    public static fetchConnListForPicker(): string[] {
        const conn_output: string[] = []

        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        connections.forEach((instr) => {
            conn_output.push(instr.friendly_name + "@" + instr.instr_address)
        })

        return conn_output
    }
}

export interface ConnectionDetails {
    name: string
    addr: string
    type: IoType
}

//Hosts multiple functions to help with creating connection with the instrument
export class ConnectionHelper {
    public static connectionType(addr: string): IoType | undefined {
        if (ConnectionHelper.IPTest(addr)) {
            return IoType.Lan
        }
        if (ConnectionHelper.VisaResourceStringTest(addr)) {
            return IoType.Visa
        }
        return undefined
    }
    public static parseConnectionString(
        connection_string: string,
    ): ConnectionDetails | undefined {
        let name = ""
        let addr = connection_string
        if (connection_string.split("@").length > 1) {
            name = connection_string.split("@")[0]
            addr = connection_string.split("@")[1]
        }
        const type = ConnectionHelper.connectionType(addr)

        if (!type) {
            return undefined
        }

        return { name: name, type: type, addr: addr }
    }

    public static IPTest(ip: string) {
        return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
            ip,
        )
    }
    public static VisaResourceStringTest(val: string): boolean {
        return /^(visa:\/\/.*\/)?((TCPIP|USB|GPIB|ASRL|FIREWIRE|GPIB-VXI|PXI|VXI)\d*)::.*/.test(
            val,
        )
    }
    public static instrConnectionStringValidator = (val: string) => {
        let conn_str = val
        if (val.split("@").length > 1) {
            conn_str = val.split("@")[1]
        }
        if (!this.IPTest(conn_str) && !this.VisaResourceStringTest(conn_str)) {
            return "Enter proper IPv4 address or VISA resource string"
        }
        return null
    }
}

/**
 * Generic class to contain debug related variables
 */
export class DebugHelper {
    /**
     * Since we need to access the active file when the user clicks
     * the debug button, we have created the debuggeeFilePath property
     * which is set to vscode active text editor file (.tsp file)
     * when the user clicks on debug button and the
     * same file is used till end of that debug session
     */
    public static debuggeeFilePath: string | undefined
}
