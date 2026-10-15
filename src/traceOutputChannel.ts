import * as vscode from "vscode"

export const TRACE_OUTPUT_CHANNEL_NAME = "TSP Instrument I/O Trace"

let traceOutputChannel: vscode.OutputChannel | undefined

export function initializeTraceOutputChannel(
    context: vscode.ExtensionContext,
): vscode.OutputChannel {
    if (traceOutputChannel === undefined) {
        traceOutputChannel = vscode.window.createOutputChannel(
            TRACE_OUTPUT_CHANNEL_NAME,
        )
        context.subscriptions.push(traceOutputChannel)
    }

    return traceOutputChannel
}

export function showTraceOutputChannel(): void {
    traceOutputChannel?.show(true)
}

export function clearTraceOutputChannel(): void {
    traceOutputChannel?.clear()
}

export function appendTraceOutputLine(line: string): void {
    traceOutputChannel?.appendLine(line)
}
