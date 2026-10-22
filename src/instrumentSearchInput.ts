export interface SearchInputDisposable {
    dispose(): void
}

export interface SearchInputBox {
    value: string
    ignoreFocusOut: boolean
    onDidChangeValue(listener: (value: string) => void): SearchInputDisposable
    onDidAccept(listener: () => void): SearchInputDisposable
    onDidHide(listener: () => void): SearchInputDisposable
    show(): void
    hide(): void
    dispose(): void
}

export class InstrumentSearchInputSession {
    private readonly listeners: SearchInputDisposable[] = []
    private accepted: boolean = false

    constructor(
        readonly input: SearchInputBox,
        private readonly baselineQuery: string,
        private readonly updateQuery: (query: string) => void,
        private readonly acceptQuery: (query: string) => void,
        private readonly onClosed: () => void,
    ) {
        input.value = baselineQuery
        input.ignoreFocusOut = true
        this.listeners.push(
            input.onDidChangeValue((value) => updateQuery(value)),
            input.onDidAccept(() => {
                const query = input.value
                updateQuery(query)
                this.accepted = true
                acceptQuery(query)
                input.hide()
            }),
            input.onDidHide(() => this.handleHide()),
        )
    }

    show() {
        this.input.show()
    }

    clear() {
        this.accepted = true
        this.updateQuery("")
        this.input.value = ""
        this.input.hide()
    }

    dispose() {
        this.accepted = true
        this.listeners.forEach((listener) => listener.dispose())
        this.listeners.length = 0
        this.input.dispose()
    }

    private handleHide() {
        if (!this.accepted) {
            this.updateQuery(this.baselineQuery)
        }
        this.listeners.forEach((listener) => listener.dispose())
        this.listeners.length = 0
        this.input.dispose()
        this.onClosed()
    }
}
