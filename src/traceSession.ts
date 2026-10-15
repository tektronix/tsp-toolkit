import { randomUUID } from "node:crypto"
import { AddressInfo } from "node:net"

export function createTraceSessionId(): string {
    return randomUUID()
}

export function buildTraceCliArguments(
    address: AddressInfo,
    sessionId: string,
): string[] {
    return [
        "--trace-socket",
        `${address.address}:${address.port}`,
        "--trace-session-id",
        sessionId,
    ]
}
