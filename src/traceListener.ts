import * as net from "node:net"
import {
    TraceJsonlParser,
    TraceMalformedLineHandler,
    TraceRecordHandler,
} from "./traceParser"

/**
 * Owns the localhost socket used by the CLI to deliver trace records.
 *
 * Each accepted socket is parsed independently so one malformed connection
 * cannot affect other trace sessions.
 */
export class TraceListener {
    private readonly _sockets = new Set<net.Socket>()
    private readonly _server = net.createServer((socket) => {
        const parser = new TraceJsonlParser(
            this._onRecord,
            this._onMalformedLine,
        )
        let parserFinished = false
        const finishParser = () => {
            if (parserFinished) {
                return
            }

            parserFinished = true
            parser.finish()
        }

        this._sockets.add(socket)
        socket.on("data", (chunk: Buffer) => parser.push(chunk))
        socket.once("end", finishParser)
        socket.once("close", () => {
            finishParser()
            this._sockets.delete(socket)
        })
    })

    private _address: net.AddressInfo | undefined

    constructor(
        private readonly _onRecord: TraceRecordHandler = () => {},
        private readonly _onMalformedLine: TraceMalformedLineHandler = () => {},
    ) {}

    get address(): net.AddressInfo | undefined {
        return this._address
    }

    async start(): Promise<net.AddressInfo> {
        if (this._address) {
            return this._address
        }

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => {
                this._server.off("listening", onListening)
                reject(error)
            }
            const onListening = () => {
                this._server.off("error", onError)
                resolve()
            }

            this._server.once("error", onError)
            this._server.once("listening", onListening)
            this._server.listen({ host: "127.0.0.1", port: 0 })
        })

        const address = this._server.address()
        if (!address || typeof address === "string") {
            await this.dispose()
            throw new Error("Trace listener did not provide a TCP address")
        }

        this._address = address
        return address
    }

    async dispose(): Promise<void> {
        this._address = undefined

        for (const socket of this._sockets) {
            socket.destroy()
        }
        this._sockets.clear()

        if (!this._server.listening) {
            return
        }

        await new Promise<void>((resolve) => {
            this._server.close(() => resolve())
        })
    }
}
