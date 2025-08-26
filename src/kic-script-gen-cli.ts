const platform = process.platform.toString()
const arch = process.arch.toString()
const script_gen = `@tektronix/script-gen-${platform}-${arch}`

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const cli = require(script_gen)

const { SCRIPT_GEN_EXECUTABLE } = cli as {
    SCRIPT_GEN_EXECUTABLE: string
}

export { SCRIPT_GEN_EXECUTABLE }
