import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { runInNewContext } from "node:vm"
import { assert } from "chai"
import { suite, test } from "mocha"
import { ModuleKind, ScriptTarget, transpileModule } from "typescript"
import type { WebviewMessage } from "../baseSessionManager"

interface ScriptUri {
    fsPath: string
    toString(): string
}

function createFixture(
    workspacePath = path.join(tmpdir(), "tsp-toolkit", "workspace"),
    destinationPath = path.join(
        tmpdir(),
        "tsp-toolkit",
        "exports",
        "saved.tsp",
    ),
) {
    const sourcePath = path.join(workspacePath, "session.tsp")
    const fileUri = (fsPath: string): ScriptUri => ({
        fsPath,
        toString: () => `file:${fsPath}`,
    })
    const state = {
        destination: fileUri(destinationPath) as ScriptUri | undefined,
        openError: undefined as Error | undefined,
        postError: undefined as Error | undefined,
        workspaceFolders: [{ uri: fileUri(workspacePath) }] as
            | { uri: ScriptUri }[]
            | undefined,
    }
    const errors: string[] = []
    const opened: string[] = []
    const posted: unknown[] = []
    const dialogs: {
        defaultUri: ScriptUri
        filters: Record<string, string[]>
    }[] = []
    const vscode = {
        Uri: { file: fileUri },
        ViewColumn: { Beside: 2 },
        workspace: {
            get workspaceFolders() {
                return state.workspaceFolders
            },
        },
        window: {
            visibleTextEditors: [],
            showSaveDialog: (options: (typeof dialogs)[number]) => {
                dialogs.push(options)
                return Promise.resolve(state.destination)
            },
            showTextDocument: (uri: ScriptUri) => {
                if (state.openError) {
                    return Promise.reject(state.openError)
                }
                opened.push(uri.fsPath)
                return Promise.resolve()
            },
            showErrorMessage: (message: string) => {
                errors.push(message)
                return Promise.resolve()
            },
        },
    }
    const source = readFileSync(
        path.join(__dirname, "..", "baseSessionManager.ts"),
        "utf8",
    )
    const compiled = transpileModule(source, {
        compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2022,
        },
    }).outputText
    const exports: Partial<typeof import("../baseSessionManager")> = {}
    const requireFromTest = createRequire(__filename)
    runInNewContext(compiled, {
        exports,
        require: (name: string): unknown =>
            name === "vscode" ? vscode : requireFromTest(name),
        Error,
    })
    assert.isDefined(exports.BaseSessionManager)
    const manager = Object.create(exports.BaseSessionManager.prototype) as {
        sessionName: string | undefined
        handleWebviewMessage(message: WebviewMessage): void
    }
    Object.assign(manager, {
        sessionName: "session",
        config: { scriptExtension: "tsp" },
        panel: {
            webview: {
                postMessage: (message: unknown) => {
                    if (state.postError) {
                        return Promise.reject(state.postError)
                    }
                    posted.push(message)
                    return Promise.resolve(true)
                },
            },
        },
    })
    const send = async (command: string, payload = "") => {
        manager.handleWebviewMessage({ command, payload })
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return {
        state,
        manager,
        errors,
        opened,
        posted,
        dialogs,
        sourcePath,
        destinationPath,
        save: () => send("save_as_generated_script"),
        openSaved: (payload: string) => send("open_saved_script", payload),
    }
}

suite("Generated script Save As", function () {
    test("asks for the path first and hands it to the generator without opening", async function () {
        const fixture = createFixture()
        await fixture.save()

        assert.lengthOf(fixture.dialogs, 1)
        assert.equal(fixture.dialogs[0].defaultUri.fsPath, fixture.sourcePath)
        assert.deepEqual(fixture.dialogs[0].filters, {
            "Script Files": ["tsp"],
        })
        assert.deepEqual(fixture.posted, [
            { command: "save_as_target", path: fixture.destinationPath },
        ])
        assert.isEmpty(fixture.opened)
        assert.isEmpty(fixture.errors)
        assert.equal(fixture.manager.sessionName, "session")
    })

    test("does nothing when the dialog is canceled", async function () {
        const fixture = createFixture()
        fixture.state.destination = undefined
        await fixture.save()

        assert.isEmpty(fixture.posted)
        assert.isEmpty(fixture.opened)
        assert.isEmpty(fixture.errors)
    })

    test("opens the file reported by the generator after generation succeeds", async function () {
        const fixture = createFixture()
        await fixture.save()
        await fixture.openSaved(fixture.destinationPath)

        assert.deepEqual(fixture.opened, [fixture.destinationPath])
        assert.isEmpty(fixture.errors)
    })

    test("does not open before the generator reports a saved file", async function () {
        const fixture = createFixture()
        await fixture.save()

        assert.isEmpty(fixture.opened)
        assert.isEmpty(fixture.errors)
    })

    test("reports an editor failure", async function () {
        const fixture = createFixture()
        await fixture.save()
        fixture.state.openError = new Error("Cannot open editor")
        await fixture.openSaved(fixture.destinationPath)

        assert.lengthOf(fixture.errors, 1)
        assert.include(fixture.errors[0], "Cannot open editor")
    })

    test("reports a failure to reach the generator", async function () {
        const fixture = createFixture()
        fixture.state.postError = new Error("Webview disposed")
        await fixture.save()

        assert.lengthOf(fixture.errors, 1)
        assert.include(fixture.errors[0], "Webview disposed")
    })

    test("reports a missing workspace before showing the dialog", async function () {
        const fixture = createFixture()
        fixture.state.workspaceFolders = undefined
        await fixture.save()

        assert.isEmpty(fixture.dialogs)
        assert.deepEqual(fixture.errors, ["No workspace folder found"])
    })

    test("reports a missing session before showing the dialog", async function () {
        const fixture = createFixture()
        fixture.manager.sessionName = undefined
        await fixture.save()

        assert.isEmpty(fixture.dialogs)
        assert.deepEqual(fixture.errors, ["No session name found"])
    })

    test("keeps Open Script separate from Save As", function () {
        const fixture = createFixture()
        fixture.manager.handleWebviewMessage({
            command: "open_script",
            payload: "",
        })

        assert.deepEqual(fixture.opened, [fixture.sourcePath])
        assert.isEmpty(fixture.dialogs)
        assert.isEmpty(fixture.posted)
    })
})
