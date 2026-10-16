import * as vscode from "vscode"
import { TraceEvent } from "./traceParser"
import { formatTraceEvent, formatTraceHeader } from "./traceFormatter"

export const TRACE_OUTPUT_CHANNEL_NAME = "TSP Instrument I/O Trace"

let traceOutputChannel: vscode.OutputChannel | undefined

function appendTraceOutputHeader(): void {
    traceOutputChannel?.appendLine(formatTraceHeader())
}

export function initializeTraceOutputChannel(
    context: vscode.ExtensionContext,
): vscode.OutputChannel {
    if (traceOutputChannel === undefined) {
        traceOutputChannel = vscode.window.createOutputChannel(
            TRACE_OUTPUT_CHANNEL_NAME,
        )
        context.subscriptions.push(traceOutputChannel)
        appendTraceOutputHeader()
    }

    return traceOutputChannel
}

export function showTraceOutputChannel(): void {
    traceOutputChannel?.show(true)
}

export function clearTraceOutputChannel(): void {
    traceOutputChannel?.clear()
    appendTraceOutputHeader()
}

export function appendTraceOutputLine(line: string): void {
    traceOutputChannel?.appendLine(line)
}

export function appendTraceEvent(event: TraceEvent): void {
    appendTraceOutputLine(formatTraceEvent(event))
}
