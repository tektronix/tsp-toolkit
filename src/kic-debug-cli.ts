const platform = process.platform.toString()
const arch = process.arch.toString()
const kic_debug = `@tektronix/kic-debug-${platform}-${arch}`

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const cli = require(kic_debug)

const { DEBUG_EXECUTABLE } = cli as {
    DEBUG_EXECUTABLE: string
}

export { DEBUG_EXECUTABLE }
