import { assert } from "chai"
import { suite, test } from "mocha"
import {
    InstrumentSearchInputSession,
    SearchInputBox,
    SearchInputDisposable,
} from "../instrumentSearchInput"

class Event<T> {
    private listeners: Array<(value: T) => void> = []

    subscribe(listener: (value: T) => void): SearchInputDisposable {
        this.listeners.push(listener)
        return {
            dispose: () => {
                this.listeners = this.listeners.filter(
                    (candidate) => candidate !== listener,
                )
            },
        }
    }

    fire(value: T) {
        for (const listener of this.listeners) {
            listener(value)
        }
    }
}

class MockInputBox implements SearchInputBox {
    value: string = ""
    ignoreFocusOut: boolean = false
    shown: boolean = false
    disposed: boolean = false
    private readonly valueChanged = new Event<string>()
    private readonly accepted = new Event<void>()
    private readonly hidden = new Event<void>()

    onDidChangeValue(listener: (value: string) => void): SearchInputDisposable {
        return this.valueChanged.subscribe(listener)
    }

    onDidAccept(listener: () => void): SearchInputDisposable {
        return this.accepted.subscribe(listener)
    }

    onDidHide(listener: () => void): SearchInputDisposable {
        return this.hidden.subscribe(listener)
    }

    show() {
        this.shown = true
    }

    hide() {
        this.shown = false
        this.hidden.fire()
    }

    dispose() {
        this.disposed = true
    }

    type(value: string) {
        this.value = value
        this.valueChanged.fire(value)
    }

    pressEnter() {
        this.accepted.fire()
    }
}

suite("Instrument Search Input Test Suite", function () {
    test("updates the query on every input change before Enter", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        const accepted: string[] = []
        const session = new InstrumentSearchInputSession(
            input,
            "",
            (query) => queries.push(query),
            (query) => accepted.push(query),
            () => undefined,
        )

        session.show()
        input.type("2")
        input.type("24")
        input.type("2461")

        assert.deepEqual(queries, ["2", "24", "2461"])
        assert.deepEqual(accepted, [])
        assert.isTrue(input.ignoreFocusOut)
    })

    test("accepts the current query and keeps it without restoring the baseline", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        const accepted: string[] = []
        let closed = false
        const session = new InstrumentSearchInputSession(
            input,
            "previous",
            (query) => queries.push(query),
            (query) => accepted.push(query),
            () => {
                closed = true
            },
        )

        session.show()
        input.type("2461")
        input.pressEnter()

        assert.deepEqual(accepted, ["2461"])
        assert.deepEqual(queries, ["2461", "2461"])
        assert.isFalse(input.shown)
        assert.isTrue(input.disposed)
        assert.isTrue(closed)
    })

    test("restores the baseline when dismissed without accepting", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        new InstrumentSearchInputSession(
            input,
            "old-query",
            (query) => queries.push(query),
            () => undefined,
            () => undefined,
        )

        input.type("new-query")
        input.hide()

        assert.deepEqual(queries, ["new-query", "old-query"])
    })

    test("restores an unfiltered state when an initial search is dismissed", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        new InstrumentSearchInputSession(
            input,
            "",
            (query) => queries.push(query),
            () => undefined,
            () => undefined,
        )

        input.type("2461")
        input.hide()

        assert.deepEqual(queries, ["2461", ""])
    })

    test("passes whitespace updates through so the provider can clear filtering", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        const session = new InstrumentSearchInputSession(
            input,
            "",
            (query) => queries.push(query),
            () => undefined,
            () => undefined,
        )

        input.type("   ")

        assert.deepEqual(queries, ["   "])
        assert.isTrue(session.input.ignoreFocusOut)
    })

    test("clears without restoring the previous query", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        const session = new InstrumentSearchInputSession(
            input,
            "old-query",
            (query) => queries.push(query),
            () => undefined,
            () => undefined,
        )

        session.show()
        session.clear()

        assert.deepEqual(queries, [""])
        assert.isFalse(input.shown)
        assert.isTrue(input.disposed)
    })

    test("disposal releases listeners without restoring the baseline", function () {
        const input = new MockInputBox()
        const queries: string[] = []
        let closed = false
        const session = new InstrumentSearchInputSession(
            input,
            "previous",
            (query) => queries.push(query),
            () => undefined,
            () => {
                closed = true
            },
        )

        input.type("2461")
        session.dispose()
        input.type("2450")
        input.hide()

        assert.deepEqual(queries, ["2461"])
        assert.isTrue(input.disposed)
        assert.isFalse(closed)
    })
})
