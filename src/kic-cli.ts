const platform = process.platform.toString()
const arch = process.arch.toString()
const kic_cli = `@tektronix/kic-cli-${platform}-${arch}`

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const cli = require(kic_cli)

const { EXECUTABLE, DISCOVER_EXECUTABLE } = cli as {
    EXECUTABLE: string
    DISCOVER_EXECUTABLE: string
}

export { EXECUTABLE, DISCOVER_EXECUTABLE }