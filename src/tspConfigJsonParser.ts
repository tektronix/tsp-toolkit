import * as fs from "fs"

interface Slot {
    [slotNumber: string]: string
}

interface Node {
    model: string
    slots?: Slot
}

interface Nodes {
    [nodeName: string]: Node
}

interface JsonData {
    nodes: Nodes
    self?: string
}

/**
 * Get the Config.tsp.json file path and parser it
 * @param filePath Json file path
 * @returns Configured nodes details
 */
export function getNodeDetails(filePath: string): Record<string, string[]> {
    const json: string = fs.readFileSync(filePath, "utf8")
    const data: JsonData = JSON.parse(json) as JsonData
    const output: Record<string, string[]> = {}

    if (data.nodes) {
        Object.entries(data.nodes).forEach(([nodeName, nodeData]) => {
            const model = nodeData.model
            const slots = nodeData.slots || {}

            if (model in output) {
                output[model].push(nodeName)
            } else {
                output[model] = [nodeName]
            }

            Object.entries(slots).forEach(([slotNumber, slotModel]) => {
                const slotKey = `${nodeName}.${slotNumber}`

                if (slotModel in output) {
                    output[slotModel].push(slotKey)
                } else {
                    output[slotModel] = [slotKey]
                }
            })
        })
    }

    if (data.self) {
        if (data.self in output) {
            output[data.self].push("self")
        } else {
            output[data.self] = ["self"]
        }
    }

    return output
}

export function getClassName(file_path: string): string {
    // Read the file content
    const content = fs.readFileSync(file_path, "utf-8")
    const regex = /---@class\s+(.+)/
    const match = content.match(regex)
    let className = ""
    if (match && match.length > 1) {
        className = match[1]
    }
    return className
}
/**
 * @param list1 list1
 * @param list2 list2
 * @returns return true if both the last are same
 */
export function compareLists<T>(list1: T[], list2: T[]): boolean {
    if (list1.length !== list2.length) {
        return false
    }
    return list1.every((item, index) => item === list2[index])
}
