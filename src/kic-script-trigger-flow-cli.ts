const platform = process.platform.toString()
const arch = process.arch.toString()
const trigger_flow = `@tektronix/trigger-flow-${platform}-${arch}`

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const cli = require(trigger_flow)

const { TRIGGER_FLOW_EXECUTABLE } = cli as {
    TRIGGER_FLOW_EXECUTABLE: string
}

export { TRIGGER_FLOW_EXECUTABLE }
