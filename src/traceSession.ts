import { randomUUID } from "node:crypto"

export function createTraceSessionId(): string {
    return randomUUID()
}
