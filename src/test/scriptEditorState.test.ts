import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { runInNewContext } from "node:vm"
import { assert } from "chai"
import { suite, test } from "mocha"
import { ModuleKind, ScriptTarget, transpileModule } from "typescript"

/**
 * Defines the minimum properties and methods required to test
 * the script editor state functionality of BaseSessionManager.
 */
interface TestManager {
    sessionName: string
    config: { scriptExtension: string }
    panel: {
        webview: {
            postMessage: (message: { isOpen: boolean }) => Promise<boolean>
        }
    }
    scriptEditorStateDisposables: { dispose: () => void }[]
    setupScriptEditorStateListeners: () => void
    disposeScriptEditorStateListeners: () => void
    openGeneratedScript: () => Promise<void>
    isGeneratedScriptOpen: () => boolean
}

/**
 * Creates an isolated test environment with mocked VS Code APIs.
 *
 * Loads and executes the actual BaseSessionManager implementation,
 * allowing its script editor state methods to be tested without
 * starting VS Code, child processes, or unrelated services.
 *
 * Also provides utilities to simulate editor tab changes and
 * capture the active state messages sent to the webview.
 */
function createFixture() {
    const scriptPath = path.resolve("script-editor-state-test", "example.tsp")

    // Simulate VS Code's text editor tab input.
    class TabInputText {
        constructor(public uri: { fsPath: string }) {}
    }

    // Create an initial editor tab containing the generated script.
    const scriptTab = { input: new TabInputText({ fsPath: scriptPath }) }

    // Simulate an editor group containing the script tab.
    const group = { tabs: [scriptTab], activeTab: scriptTab, viewColumn: 2 }

    // Store registered tab-change listeners so tests can trigger them manually.
    const listeners = new Set<() => void>()

    // Simulate VS Code event registration and disposal.
    const event = (listener: () => void) => {
        listeners.add(listener)
        return { dispose: () => listeners.delete(listener) }
    }

    // Capture every active/inactive state message sent to the webview.
    const states: boolean[] = []

    // Provide mocked VS Code APIs required by BaseSessionManager
    const vscode = {
        TabInputText,
        ViewColumn: { Beside: -2 },
        Uri: { file: (fsPath: string) => ({ fsPath }) },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: path.dirname(scriptPath) } }],
            // Keep the document cached even when its editor tab is closed.
            // This verifies that button state depends on open tabs, not cached documents.
            textDocuments: [{ uri: { fsPath: scriptPath } }],
        },
        window: {
            // Simulate opening the generated script in editor group 2
            showTextDocument: () => Promise.resolve({ viewColumn: 2 }),
            visibleTextEditors: [{ document: { uri: { fsPath: scriptPath } } }],
            tabGroups: {
                all: [group],
                onDidChangeTabs: event,
                onDidChangeTabGroups: event,
            },
        },
    }

    // Read the actual BaseSessionManager TypeScript source file.
    const source = readFileSync(
        path.join(__dirname, "..", "baseSessionManager.ts"),
        "utf8",
    )

    // Transpile TypeScript into CommonJS JavaScript for isolated execution.
    const compiled = transpileModule(source, {
        compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2022,
        },
    }).outputText

    const exports: { BaseSessionManager?: { prototype: TestManager } } = {}

    // Resolve dependencies relative to the current test file.
    const requireFromTest = createRequire(__filename)

    // Execute the actual implementation while replacing the VS Code
    // dependency with the mocked VS Code environment created above.
    runInNewContext(compiled, {
        exports,
        process,
        console,
        require: (name: string): unknown =>
            name === "vscode" ? vscode : requireFromTest(name),
    })
    assert.exists(exports.BaseSessionManager)

    // Create an object using the actual BaseSessionManager prototype
    // without executing its constructor or initializing unrelated services.
    const manager = Object.create(
        exports.BaseSessionManager.prototype,
    ) as TestManager

    // Initialize only the properties needed by these tests.
    manager.sessionName = "example"
    manager.config = { scriptExtension: "tsp" }

    // Mock the webview and record every script editor state update.
    manager.panel = {
        webview: {
            postMessage: (message) => {
                states.push(message.isOpen)
                return Promise.resolve(true)
            },
        },
    }

    const replacePanel = () => {
        manager.panel = {
            webview: {
                postMessage: (message) => {
                    states.push(message.isOpen)
                    return Promise.resolve(true)
                },
            },
        }
    }

    // Register the actual script editor state listeners.
    manager.setupScriptEditorStateListeners()
    return {
        manager,
        group,
        scriptTab,
        states,
        vscode,
        replacePanel,
        // Manually trigger all registered tab-change listeners.
        fire: () => listeners.forEach((listener) => listener()),
        // Expose listeners to verify that they are disposed correctly.
        listeners,
    }
}

suite("Script editor button state", function () {
    /**
     * Verifies that independently opening the generated script
     * does not activate the Open Script button.
     *
     * The button should only become active when it owns the
     * specific editor tab opened or focused through its action.
     */
    test("does not highlight a script opened independently", function () {
        const fixture = createFixture()

        // Simulate an editor tab change without clicking Open Script.
        fixture.fire()

        // The independently opened script must not activate the button.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())

        // Verify that the inactive state was sent to the webview.
        assert.deepEqual(fixture.states, [false])
    })

    /**
     * Verifies that clicking Open Script associates the button
     * with the generated script tab and activates its highlight.
     */
    test("highlights after the Open Script action", async function () {
        const fixture = createFixture()

        // Simulate clicking Open Script.
        await fixture.manager.openGeneratedScript()

        // The button should be active after successfully identifying its tab
        assert.isTrue(fixture.manager.isGeneratedScriptOpen())
    })

    test("ignores a successful Open Script completion from a replaced panel", async function () {
        const fixture = createFixture()
        let resolveOpen!: (editor: { viewColumn: number }) => void
        fixture.vscode.window.showTextDocument = () =>
            new Promise((resolve) => {
                resolveOpen = resolve
            })

        const opening = fixture.manager.openGeneratedScript()
        fixture.manager.disposeScriptEditorStateListeners()
        fixture.replacePanel()
        resolveOpen({ viewColumn: 2 })
        await opening

        assert.isFalse(fixture.manager.isGeneratedScriptOpen())
        assert.deepEqual(fixture.states, [])
    })

    test("ignores a failed Open Script completion from a replaced panel", async function () {
        const fixture = createFixture()
        let rejectOpen!: (error: Error) => void
        let firstOpen = true
        fixture.vscode.window.showTextDocument = () => {
            if (firstOpen) {
                firstOpen = false
                return new Promise((_, reject) => {
                    rejectOpen = reject
                })
            }
            return Promise.resolve({ viewColumn: 2 })
        }

        const staleOpening = fixture.manager.openGeneratedScript()
        fixture.manager.disposeScriptEditorStateListeners()
        fixture.replacePanel()
        await fixture.manager.openGeneratedScript()
        assert.isTrue(fixture.manager.isGeneratedScriptOpen())

        rejectOpen(new Error("Panel closed"))
        await staleOpening

        assert.isTrue(fixture.manager.isGeneratedScriptOpen())
        assert.deepEqual(fixture.states, [true])
    })

    /**
     * Verifies that closing the button-owned tab clears its highlight
     * even when VS Code still keeps the corresponding document cached.
     *
     * Also verifies that independently reopening the same script
     * does not restore the previous button ownership.
     */
    test("clears on owned tab closure despite a cached document", async function () {
        const fixture = createFixture()

        // Open the script through the button and establish tab ownership.
        await fixture.manager.openGeneratedScript()

        // Simulate closing the button-owned editor tab.
        fixture.group.tabs = []
        fixture.fire()

        // The document remains cached even though its editor tab is closed.
        assert.lengthOf(fixture.vscode.workspace.textDocuments, 1)

        // The button must become inactive because its owned tab no longer exists.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())

        // Verify that the inactive state was sent to the webview.
        assert.isFalse(fixture.states[fixture.states.length - 1])

        // Simulate independently reopening the same script in a new tab.
        fixture.group.tabs = [fixture.scriptTab]
        fixture.fire()

        // The new tab must not inherit the previous tab's ownership.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())
    })

    /**
     * Verifies that closing an unrelated tab containing the same script
     * does not clear the highlight while the button-owned tab remains open.
     */
    test("keeps highlighting when an unrelated tab closes", async function () {
        const fixture = createFixture()

        // Add another tab containing the same script.
        // This tab has a different object reference from the original tab.
        fixture.group.tabs.push({ input: fixture.scriptTab.input })

        // Open the script through the button, associating it with the active tab.
        await fixture.manager.openGeneratedScript()

        // Close the additional tab, leaving the button-owned tab open.
        fixture.group.tabs.pop()

        // Simulate having no visible text editors.
        // Tab ownership should still be determined from the editor tab groups.
        fixture.vscode.window.visibleTextEditors = []

        fixture.fire()

        // The button-owned tab still exists, so the highlight must remain active.
        assert.isTrue(fixture.manager.isGeneratedScriptOpen())
    })

    /**
     * Verifies that ownership is not transferred to a newly opened tab
     * when the original button-owned tab closes and another tab containing
     * the same script appears in the same tab-change update.
     */
    test("does not transfer ownership to an independently reopened tab", async function () {
        const fixture = createFixture()

        // Open the script through the button and record the original tab reference.
        await fixture.manager.openGeneratedScript()

        // Replace the original tab with a new tab containing the same script.
        // The file path is identical, but the tab object is different.
        fixture.group.tabs = [{ input: fixture.scriptTab.input }]

        // Simulate the tab-change notification.
        fixture.fire()

        // The original owned tab no longer exists, so ownership must be cleared.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())

        // Verify that the webview receives the inactive state.
        assert.isFalse(fixture.states[fixture.states.length - 1])
    })

    /**
     * Verifies that closing the button-owned tab clears the highlight
     * even when another editor group still contains the same script.
     *
     * This covers the scenario where the script was already open
     * independently before the Open Script button was clicked.
     */
    test("clears when the button-opened tab closes while an earlier script tab remains", async function () {
        const fixture = createFixture()

        // Create an independently opened tab containing the same script.
        const earlierTab = { input: fixture.scriptTab.input }

        // Place the earlier tab in a separate editor group (column 1).
        fixture.vscode.window.tabGroups.all.unshift({
            viewColumn: 1,
            activeTab: earlierTab,
            tabs: [earlierTab],
        })

        // Verify that an independently opened script does not activate the button.
        fixture.fire()
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())

        // Open the script through the button in editor group 2.
        // The button should associate itself with that group's active tab.
        await fixture.manager.openGeneratedScript()
        assert.isTrue(fixture.manager.isGeneratedScriptOpen())

        // Close the button-owned tab in editor group 2.
        fixture.group.tabs = []
        fixture.fire()

        // The button must become inactive even though the earlier tab remains open.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())

        // Verify that the inactive state was sent to the webview.
        assert.isFalse(fixture.states[fixture.states.length - 1])

        // Confirm that the independently opened tab in editor group 1 still exists.
        assert.lengthOf(fixture.vscode.window.tabGroups.all[0].tabs, 1)
    })

    /**
     * Verifies that disposing the script editor state listeners
     * removes registered tab-change listeners and clears the
     * Open Script button's tracked tab ownership.
     *
     * Prevents a newly opened webview panel from inheriting
     * the previous panel's active button state.
     */
    test("disposes tab listeners and clears button ownership", async function () {
        const fixture = createFixture()

        // Open the script through the button and establish ownership.
        await fixture.manager.openGeneratedScript()

        // Simulate closing the webview panel and disposing its listeners.
        fixture.manager.disposeScriptEditorStateListeners()

        // All registered tab-change listeners should be removed.
        assert.equal(fixture.listeners.size, 0)

        // The previous button ownership should also be cleared.
        assert.isFalse(fixture.manager.isGeneratedScriptOpen())
    })
})
