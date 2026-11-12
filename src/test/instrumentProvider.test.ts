import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { assert } from "chai"
import { ModuleKind, ScriptTarget, transpileModule } from "typescript"
import { suite, test } from "mocha"
import { ConnectionStatus } from "../connectionStatus"
import * as bulkFirmwareUpdate from "../bulkFirmwareUpdate"
import type { InstrInfo } from "../resourceManager"
import type { InstrumentProvider } from "../instrumentProvider"
import type { Instrument } from "../instrument"

const requireFromTest = createRequire(__filename)
type ProviderModule = typeof import("../instrumentProvider")
type InstrumentModule = typeof import("../instrument")

class MockEventEmitter<T> {
    private listeners = new Set<(value: T) => void>()

    event = (listener: (value: T) => void) => {
        this.listeners.add(listener)
        return { dispose: () => this.listeners.delete(listener) }
    }

    fire(value: T) {
        for (const listener of this.listeners) {
            listener(value)
        }
    }
}

class MockConnection {
    status = ConnectionStatus.Active
    lastFound = new Date()
    onChangedStatus = new MockEventEmitter<void>().event
    parent?: Instrument
    terminal?: { exitStatus?: unknown }
    disposed = false
    constructor(
        public addr: string,
        public type: string,
    ) {}

    static from(info: InstrInfo) {
        return new MockConnection(info.instr_address, info.io_type)
    }

    enable() {}
    dispose() {
        this.disposed = true
    }
    async getUpdatedStatus() {}
}

function loadSource<T>(
    filename: string,
    dependencies: Record<string, unknown>,
): T {
    const source = readFileSync(join(__dirname, "..", filename), "utf8")
    const compiled = transpileModule(source, {
        compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2022,
        },
    }).outputText
    const exports = {}
    runInNewContext(compiled, {
        exports,
        require: (name: string): unknown =>
            name in dependencies ? dependencies[name] : requireFromTest(name),
        fetch,
    })
    return exports as T
}

function createFixture(initial: Record<string, InstrInfo[]> = {}) {
    const settings: Record<string, InstrInfo[]> = {
        savedInstruments: [],
        hiddenInstruments: [],
        ...initial,
    }
    const errors: string[] = []
    const connectionCalls: { command: string; shown: boolean }[] = []
    const configChanges = new MockEventEmitter<{
        affectsConfiguration: (key: string) => boolean
    }>()
    let failingSetting: string | undefined
    const vscode = {
        TreeItem: class {
            constructor(public label: string) {}
        },
        TreeItemCollapsibleState: { Collapsed: 1, Expanded: 2, None: 0 },
        MarkdownString: class {},
        EventEmitter: MockEventEmitter,
        ConfigurationTarget: { Global: 1 },
        commands: {
            executeCommand: (command: string) => {
                if (command === "tsp.openTerminalIP") {
                    connectionCalls.push({
                        command,
                        shown: settings.hiddenInstruments.length === 0,
                    })
                }
                return Promise.resolve()
            },
        },
        window: {
            showErrorMessage: (message: string) => errors.push(message),
            withProgress: (_options: unknown, callback: () => Promise<void>) =>
                callback(),
        },
        workspace: {
            onDidChangeConfiguration: configChanges.event,
            getConfiguration: () => ({
                get: (key: string) => structuredClone(settings[key]),
                update: (key: string, value: InstrInfo[]): Promise<void> => {
                    if (key === failingSetting) {
                        return Promise.reject(new Error(`Cannot update ${key}`))
                    }
                    settings[key] = structuredClone(value)
                    configChanges.fire({
                        affectsConfiguration: (name) => name === `tsp.${key}`,
                    })
                    return Promise.resolve()
                },
            }),
        },
    }
    const dependencies = {
        vscode,
        "./connection": {
            Connection: MockConnection,
            ConnectionStatus,
            connectionStatusIcon: () => undefined,
            contextValueStatus: (value: string, status: ConnectionStatus) =>
                value.replace(
                    /Hidden|Inactive|Active|Connecting|Connected/,
                    ConnectionStatus[status],
                ),
        },
        "./resourceManager": {
            IoType: { Lan: "Lan", Visa: "Visa" },
            idn_to_string: () => "",
        },
        "./logging": {
            Log: {
                debug() {},
                info() {},
                trace() {},
                error() {},
            },
        },
        "./instrumentExplorer": { DISCOVERY_TIMEOUT: 5 },
        "./bulkFirmwareUpdate": bulkFirmwareUpdate,
    }
    const instruments = loadSource<InstrumentModule>(
        "instrument.ts",
        dependencies,
    )
    const { InstrumentProvider: Provider } = loadSource<ProviderModule>(
        "instrumentProvider.ts",
        {
            ...dependencies,
            "./instrument": instruments,
        },
    )
    return {
        settings,
        errors,
        connectionCalls,
        instruments,
        newProvider: () => new Provider(),
        connect: async (
            provider: InstrumentProvider,
            instrument: Instrument,
        ) => {
            await provider.showHiddenConnection(instrument.connections[0])
            await vscode.commands.executeCommand("tsp.openTerminalIP")
        },
        failUpdates: (key: string) => {
            failingSetting = key
        },
    }
}

function entry(serialNumber = "SN-1", address = "192.0.2.1"): InstrInfo {
    return {
        io_type: "Lan" as InstrInfo["io_type"],
        instr_address: address,
        manufacturer: "Keithley",
        model: "MP5103",
        serial_number: serialNumber,
        firmware_revision: "1.0",
        instr_categ: "versatest",
        friendly_name: `Instrument ${serialNumber}`,
    }
}

async function assertHidden(
    provider: InstrumentProvider,
    instrument: Instrument,
    hiddenList: typeof import("../instrument").HiddenInstruments,
    offlineList: typeof import("../instrument").InactiveInstrumentList,
) {
    assert.equal(instrument.status, ConnectionStatus.Hidden)
    assert.isFalse(instrument.saved)
    assert.include(
        (await provider.getChildren(new hiddenList())) ?? [],
        instrument,
    )
    assert.notInclude(
        (await provider.getChildren(new offlineList())) ?? [],
        instrument,
    )
    assert.notInclude((await provider.getChildren()) ?? [], instrument)
    assert.isEmpty(provider.getQuickPickOptions())
}

suite("Instrument hiding Test Suite", function () {
    test("Refresh does not schedule hidden instrument status checks", async function () {
        const fixture = createFixture({
            hiddenInstruments: [entry()],
            savedInstruments: [entry("SN-2", "192.0.2.2")],
        })
        const provider = fixture.newProvider()
        const hidden = provider.instruments.find((i) => i.hidden)!
        const visible = provider.instruments.find((i) => !i.hidden)!
        let hiddenChecks = 0
        let visibleChecks = 0
        let discoveryCalls = 0
        hidden.getUpdatedStatus = () => {
            hiddenChecks++
            return Promise.resolve()
        }
        visible.getUpdatedStatus = () => {
            visibleChecks++
            return Promise.resolve()
        }

        await provider.refresh(() => {
            discoveryCalls++
            return Promise.resolve()
        })

        assert.equal(hiddenChecks, 0)
        assert.equal(visibleChecks, 1)
        assert.equal(discoveryCalls, 1)
    })

    test("Direct status polling skips hidden connections and resumes after Show", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        let checks = 0
        instrument.connections[0].getUpdatedStatus = () => {
            checks++
            return Promise.resolve()
        }

        await instrument.getUpdatedStatus()
        assert.equal(checks, 0)

        await provider.showHiddenConnection(instrument.connections[0])
        await instrument.getUpdatedStatus()
        assert.equal(checks, 1)
    })

    test("Hiding during a connection check skips the remaining checks", async function () {
        const fixture = createFixture({
            savedInstruments: [
                entry(),
                {
                    ...entry(),
                    io_type: "Visa" as InstrInfo["io_type"],
                    instr_address: "USB::SN-1",
                },
            ],
        })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        assert.lengthOf(instrument.connections, 2)
        const [first, second] = instrument.connections
        let checks = 0
        first.getUpdatedStatus = async () => {
            checks++
            await provider.hideInstrument(instrument)
        }
        second.getUpdatedStatus = () => {
            checks++
            return Promise.resolve()
        }

        await instrument.getUpdatedStatus()

        assert.isTrue(instrument.hidden)
        assert.equal(checks, 1)
    })

    test("Hidden Instruments uses the new section label and status name", function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()

        assert.equal(
            new fixture.instruments.HiddenInstruments().label,
            "Hidden Instruments",
        )
        assert.equal(ConnectionStatus[0], "Hidden")
        assert.include(provider.instruments[0].contextValue ?? "", "Hidden")
    })

    test("Hide and Show contribute the eye icons and hidden menu contexts", function () {
        const manifest = JSON.parse(
            readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
        ) as {
            contributes: {
                commands: {
                    command: string
                    title: string
                    icon?: string
                }[]
                configuration: {
                    properties: Record<string, { default?: unknown }>
                }
                menus: Record<string, { command: string; when?: string }[]>
            }
        }
        const { commands, configuration, menus } = manifest.contributes
        const hide = commands.find(
            (command) => command.command === "InstrumentsExplorer.hide",
        )
        const show = commands.find(
            (command) => command.command === "InstrumentsExplorer.show",
        )

        assert.equal(hide?.title, "Hide")
        assert.equal(hide?.icon, "$(eye-closed)")
        assert.equal(show?.title, "Show")
        assert.equal(show?.icon, "$(eye)")
        assert.deepEqual(
            configuration.properties["tsp.hiddenInstruments"].default,
            [],
        )
        assert.isFalse(
            Object.hasOwn(configuration.properties, "tsp.ignoredInstruments"),
        )
        for (const command of [...commands, ...Object.values(menus).flat()]) {
            assert.notInclude(
                ["InstrumentsExplorer.remove", "InstrumentsExplorer.restore"],
                command.command,
            )
        }
        const contextMenu = menus["view/item/context"]
        assert.equal(
            contextMenu.find(
                (item) => item.command === "InstrumentsExplorer.show",
            )?.when,
            "view == InstrumentsExplorer && viewItem =~ /Instr.*Hidden.*/",
        )
        assert.equal(
            contextMenu.find(
                (item) => item.command === "InstrumentsExplorer.hide",
            )?.when,
            "view == InstrumentsExplorer && viewItem =~ /Instr.*/ && !(viewItem =~ /.*Hidden.*/) && !(viewItem =~ /.*Connected.*/)",
        )
        assert.include(
            contextMenu.find((item) => item.command === "tsp.openTerminalIP")
                ?.when ?? "",
            "CONN.*Hidden",
        )
        assert.include(
            contextMenu.find(
                (item) => item.command === "InstrumentsExplorer.save",
            )?.when ?? "",
            "!(viewItem =~ /.*Hidden.*/)",
        )
    })

    test("Preparing a normal connection does not save its instrument", async function () {
        const fixture = createFixture()
        const provider = fixture.newProvider()
        const instrument = fixture.instruments.Instrument.from(entry())
        provider.addOrUpdateInstrument(instrument)

        await provider.showHiddenConnection(instrument.connections[0])

        assert.isFalse(instrument.saved)
        assert.isEmpty(fixture.settings.savedInstruments)
    })

    test("Connect shows a hidden instrument before opening its terminal", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()

        await fixture.connect(provider, provider.instruments[0])

        assert.isTrue(provider.instruments[0].saved)
        assert.isFalse(provider.instruments[0].hidden)
        assert.deepEqual(fixture.connectionCalls, [
            {
                command: "tsp.openTerminalIP",
                shown: true,
            },
        ])
    })

    test("Showing a specific connection shows its parent with all connections", async function () {
        const fixture = createFixture({
            hiddenInstruments: [
                entry(),
                {
                    ...entry(),
                    io_type: "Visa" as InstrInfo["io_type"],
                    instr_address: "USB::SN-1",
                },
            ],
        })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        const connection = instrument.connections.find(
            (c) => c.addr === "USB::SN-1",
        )!
        await provider.showHiddenConnection(connection)

        assert.isFalse(instrument.hidden)
        assert.isTrue(instrument.saved)
        assert.strictEqual(connection.parent, instrument)
        assert.isEmpty(fixture.connectionCalls)
        assert.lengthOf(fixture.settings.savedInstruments, 2)
        assert.isEmpty(fixture.settings.hiddenInstruments)
    })

    test("Connect does not open a terminal if showing fails", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        fixture.failUpdates("hiddenInstruments")

        let failure: unknown
        try {
            await fixture.connect(provider, provider.instruments[0])
        } catch (error) {
            failure = error
        }

        assert.equal(String(failure), "Error: Cannot update hiddenInstruments")
        assert.isEmpty(fixture.connectionCalls)
        assert.isTrue(provider.instruments[0].hidden)
    })

    test("A typed connection resolves to and shows the hidden instrument", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const hidden = provider.instruments[0]
        const typed = fixture.instruments.Instrument.from(entry())

        const tracked = provider.addOrUpdateInstrument(typed)

        assert.strictEqual(tracked, hidden)
        assert.isTrue(tracked.hidden)
        assert.isEmpty(fixture.settings.savedInstruments)

        await provider.saveInstrument(tracked)
        assert.isFalse(hidden.hidden)
        assert.isTrue(hidden.saved)
        assert.isEmpty(fixture.settings.hiddenInstruments)
        assert.lengthOf(fixture.settings.savedInstruments, 1)
    })

    test("Preparing another connection leaves hidden instruments unchanged", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const other = fixture.instruments.Instrument.from(entry("SN-2"))

        await provider.showHiddenConnection(other.connections[0])
        assert.isTrue(provider.instruments[0].hidden)
        assert.lengthOf(fixture.settings.hiddenInstruments, 1)
        assert.isEmpty(fixture.settings.savedInstruments)
    })

    test("An unnamed typed connection string resolves to the hidden instrument's connection", function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const existing = provider.instruments[0].connections[0]

        const found = provider.getConnection({
            name: "",
            addr: "192.0.2.1",
            type: "lan",
        } as unknown as Parameters<InstrumentProvider["getConnection"]>[0])

        assert.strictEqual(found, existing)
        assert.isNull(
            provider.getConnection({
                name: "",
                addr: "192.0.2.99",
                type: "lan",
            } as unknown as Parameters<InstrumentProvider["getConnection"]>[0]),
        )
    })

    test("Discovery does not downgrade a connection with a live terminal", function () {
        const fixture = createFixture()
        const provider = fixture.newProvider()
        const instrument = fixture.instruments.Instrument.from(entry())
        provider.addOrUpdateInstrument(instrument)
        const tracked = instrument.connections[0] as unknown as MockConnection
        tracked.terminal = {}
        tracked.status = ConnectionStatus.Connected

        provider.addOrUpdateInstrument(
            fixture.instruments.Instrument.from(entry()),
        )

        assert.equal(tracked.status, ConnectionStatus.Connected)
    })

    test("A connection owning a live terminal replaces a stale tracked connection", function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        const stale = instrument.connections[0] as unknown as MockConnection
        const typed = fixture.instruments.Instrument.from(entry())
        const live = typed.connections[0] as unknown as MockConnection
        live.terminal = {}
        live.status = ConnectionStatus.Connected

        provider.addOrUpdateInstrument(typed)

        assert.strictEqual(
            instrument.connections[0] as unknown as MockConnection,
            live,
        )
        assert.strictEqual(live.parent, instrument)
        assert.isTrue(stale.disposed)

        provider.addOrUpdateInstrument(
            fixture.instruments.Instrument.from(entry()),
        )
        assert.equal(live.status, ConnectionStatus.Connected)
    })

    test("Hide persists all connections and moves only the selected instrument", async function () {
        const selected = entry()
        const other = { ...entry(), model: "2450" }
        const fixture = createFixture({
            savedInstruments: [selected, other],
        })
        const provider = fixture.newProvider()
        const instrument = provider.instruments.find(
            (i) => i.info.model === selected.model,
        )!
        const visa = {
            ...selected,
            io_type: "Visa" as InstrInfo["io_type"],
            instr_address: "USB::SN-1",
        }
        provider.addOrUpdateInstrument(
            fixture.instruments.Instrument.from(visa),
        )

        await provider.hideInstrument(instrument)

        assert.deepEqual(fixture.settings.savedInstruments, [other])
        assert.lengthOf(fixture.settings.hiddenInstruments, 2)
        assert.lengthOf(provider.instruments, 2)
        assert.include(
            (await provider.getChildren(
                new fixture.instruments.HiddenInstruments(),
            )) ?? [],
            instrument,
        )
        assert.equal(instrument.status, ConnectionStatus.Hidden)
        assert.isFalse(instrument.saved)
    })

    test("Hidden instruments survive rediscovery, refresh, and a new provider", async function () {
        const fixture = createFixture({ savedInstruments: [entry()] })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        await provider.hideInstrument(instrument)
        provider.addOrUpdateInstrument(
            fixture.instruments.Instrument.from(entry("SN-1", "192.0.2.2")),
        )
        await provider.refresh(async () => {})
        await assertHidden(
            provider,
            instrument,
            fixture.instruments.HiddenInstruments,
            fixture.instruments.InactiveInstrumentList,
        )

        const restarted = fixture.newProvider()
        assert.lengthOf(restarted.instruments, 1)
        await assertHidden(
            restarted,
            restarted.instruments[0],
            fixture.instruments.HiddenInstruments,
            fixture.instruments.InactiveInstrumentList,
        )
    })

    test("Show saves a hidden instrument and clears persisted hidden entries", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]

        await provider.saveInstrument(instrument)

        assert.isFalse(instrument.hidden)
        assert.isTrue(instrument.saved)
        assert.isEmpty(fixture.settings.hiddenInstruments)
        assert.lengthOf(fixture.settings.savedInstruments, 1)
        assert.include((await provider.getChildren()) ?? [], instrument)
        assert.isFalse(fixture.newProvider().instruments[0].hidden)
    })

    test("Repeated hiding does not duplicate persisted connections", async function () {
        const fixture = createFixture({ savedInstruments: [entry()] })
        const provider = fixture.newProvider()
        await provider.hideInstrument(provider.instruments[0])
        await provider.hideInstrument(provider.instruments[0])
        assert.lengthOf(fixture.settings.hiddenInstruments, 1)
    })

    test("Persistence errors are surfaced without moving the instrument", async function () {
        const fixture = createFixture({ savedInstruments: [entry()] })
        const provider = fixture.newProvider()
        const instrument = provider.instruments[0]
        fixture.failUpdates("hiddenInstruments")

        let failure: unknown
        try {
            await provider.hideInstrument(instrument)
        } catch (error) {
            failure = error
        }

        assert.equal(String(failure), "Error: Cannot update hiddenInstruments")
        assert.lengthOf(fixture.errors, 1)
        assert.isFalse(instrument.hidden)
        assert.isTrue(instrument.saved)
        assert.lengthOf(fixture.settings.savedInstruments, 1)
    })

    test("A saved-list update failure rolls back the hidden-list update", async function () {
        const fixture = createFixture({ savedInstruments: [entry()] })
        const provider = fixture.newProvider()
        fixture.failUpdates("savedInstruments")

        let failure: unknown
        try {
            await provider.hideInstrument(provider.instruments[0])
        } catch (error) {
            failure = error
        }

        assert.equal(String(failure), "Error: Cannot update savedInstruments")
        assert.isEmpty(fixture.settings.hiddenInstruments)
        assert.lengthOf(fixture.settings.savedInstruments, 1)
        assert.isTrue(provider.instruments[0].saved)
        assert.isFalse(provider.instruments[0].hidden)
    })

    test("A failed show keeps the instrument hidden and rolls back saving", async function () {
        const fixture = createFixture({ hiddenInstruments: [entry()] })
        const provider = fixture.newProvider()
        fixture.failUpdates("hiddenInstruments")

        let failure: unknown
        try {
            await provider.saveInstrument(provider.instruments[0])
        } catch (error) {
            failure = error
        }

        assert.equal(String(failure), "Error: Cannot update hiddenInstruments")
        assert.isEmpty(fixture.settings.savedInstruments)
        assert.lengthOf(fixture.settings.hiddenInstruments, 1)
        assert.isTrue(provider.instruments[0].hidden)
        assert.isFalse(provider.instruments[0].saved)
    })

    test("Showing an instrument preserves another model with the same serial", async function () {
        const other = { ...entry(), model: "2450" }
        const fixture = createFixture({
            savedInstruments: [other],
            hiddenInstruments: [entry()],
        })
        const provider = fixture.newProvider()
        const instrument = provider.instruments.find(
            (i) => i.info.model === "MP5103",
        )!

        await provider.saveInstrument(instrument)

        assert.deepEqual(
            fixture.settings.savedInstruments.find((i) => i.model === "2450"),
            other,
        )
        assert.lengthOf(fixture.settings.savedInstruments, 2)
        assert.isFalse(instrument.hidden)
    })
})
