import * as path from "path"
import * as vscode from "vscode"
import type {
    Diagnostic,
    TspInterop,
} from "@tektronix/tsp-language-interop-types"

function loadTspInterop(): TspInterop {
    const packageName = `@tektronix/tsp-language-interop-${process.platform}-${process.arch}`

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const converter = require(packageName) as TspInterop

    return converter
}

/**
 * Read a .tsp file, convert it to Python via the native Rust addon, and open
 * the result in a new editor tab.  Any converter diagnostics are surfaced in
 * the VS Code Problems panel.
 */
export async function convertTspToPython(
    uri: vscode.Uri | undefined,
    diagnosticCollection: vscode.DiagnosticCollection,
): Promise<void> {
    // Allow invocation from command palette (no URI) by falling back to the
    // active editor.
    const fileUri =
        uri ??
        (vscode.window.activeTextEditor?.document.uri.fsPath.endsWith(".tsp")
            ? vscode.window.activeTextEditor.document.uri
            : undefined)

    if (!fileUri) {
        vscode.window.showErrorMessage(
            "No TSP file selected. Open a .tsp file or right-click it in the Explorer.",
        )
        return
    }

    const converter = loadTspInterop()
    if (!converter) {
        vscode.window.showErrorMessage(
            "tsp-converter native addon could not be loaded. " +
                "Please ensure the extension was built correctly.",
        )
        return
    }

    // Read source
    let source: string
    try {
        source = (await vscode.workspace.fs.readFile(fileUri)).toString()
    } catch (err) {
        vscode.window.showErrorMessage(
            `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
        )
        return
    }

    // Derive a class name from the file name (e.g. "my_script.tsp" → "MyScript")
    const baseName = path.basename(fileUri.fsPath, ".tsp")
    const className = baseName
        .split(/[_\-\s]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("")

    // Run converter
    let result: { ok: boolean; code?: string; diagnostics: Diagnostic[] }
    try {
        result = converter.convertTspToPython(source, {
            className,
            scriptPath: fileUri.fsPath,
        })
    } catch (err) {
        vscode.window.showErrorMessage(
            `Converter error: ${err instanceof Error ? err.message : String(err)}`,
        )
        return
    }

    // Push diagnostics to the Problems panel
    const vsDiagnostics = (result.diagnostics ?? []).map((d: Diagnostic) => {
        const range = d.span
            ? new vscode.Range(
                d.span.startLine - 1,
                d.span.startColumn,
                d.span.endLine - 1,
                d.span.endColumn,
            )
            : new vscode.Range(0, 0, 0, 0)

        const severity =
            d.severity === "error"
                ? vscode.DiagnosticSeverity.Error
                : d.severity === "warning"
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information

        const diag = new vscode.Diagnostic(range, d.message, severity)
        diag.code = d.code
        if (d.hint)
            diag.relatedInformation = [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(fileUri, range),
                    d.hint,
                ),
            ]
        return diag
    })
    diagnosticCollection.set(fileUri, vsDiagnostics)

    if (!result.ok || !result.code) {
        const errMsg = result.diagnostics?.[0]?.message ?? "Unknown error"
        vscode.window.showErrorMessage(`TSP conversion failed: ${errMsg}`)
        return
    }

    // Save generated Python to a file with .py extension
    const outputPath = fileUri.fsPath.replace(/\.tsp$/, ".py")
    const outputUri = vscode.Uri.file(outputPath)

    // Write the file to disk
    const encoder = new TextEncoder()
    await vscode.workspace.fs.writeFile(outputUri, encoder.encode(result.code))

    // Open the saved file in editor
    const doc = await vscode.workspace.openTextDocument(outputUri)
    await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
    })
}
