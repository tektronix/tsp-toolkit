import { SAXParser } from "sax-ts"

//Responsible for parsing xml output to display
//the tsp script output in the VS Code Output terminal
export class OutputParser {
    private _concatStr = ""
    private _outputStr = ""
    private _outputParsed = false
    private static readonly xml_tsp_tag: string =
        "TSPDBG-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4"
    private static readonly xml_tsp_tag2: string =
        "tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4"
    private static readonly close_tag = `</${OutputParser.xml_tsp_tag2}>`
    private static readonly open_tag = `<${OutputParser.xml_tsp_tag2}>`
    private static readonly exception_list: string[] = [
        "<stack>",
        "<stacks>",
        "<global>",
        "<globals>",
        "<upvalue>",
        "<upvalues>",
        "<local>",
        "<locals>",
        "<watchpoint>",
        "</watchpoints>",
        "</stack>",
        "</stacks>",
        "</global>",
        "</globals>",
        "</upvalue>",
        "</upvalues>",
        "</local>",
        "</locals>",
        OutputParser.open_tag,
        OutputParser.close_tag,
    ]

    /**
     * collectDataChunk will collect the trail of data chunks, one at a time
     *
     * @param strChunk The chunk to be cleaned up and added to the stream of chunks
     */
    public collectDataChunk(strChunk: string) {
        this._outputParsed = false
        strChunk = strChunk.replaceAll("TSP> ", "")
        this._concatStr = this._concatStr.concat(strChunk)
        // breakingIndex is the index where the next iteration of parsing should start
        let breakingIndex = 0
        let parseOutput = false
        if (
            this._concatStr.includes(
                "<debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>",
            )
        ) {
            parseOutput = true
            breakingIndex =
                this._concatStr.indexOf("<debug-prompt />") +
                "<debug-prompt /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>"
                    .length
        } else if (
            this._concatStr.includes(
                "<session-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>",
            )
        ) {
            parseOutput = true
            breakingIndex =
                this._concatStr.indexOf("<session-end />") +
                "<session-end /></tspdbg-AA4E9540-A46C-4671-81D7-4FE69A9B6DC4>"
                    .length
        }

        if (parseOutput) {
            const remainingStr = this._concatStr.substring(breakingIndex)
            this._concatStr = this._concatStr.substring(0, breakingIndex)
            this._outputStr = this.updateParsedOutput(this._concatStr)
            this._outputParsed = true
            this._concatStr = remainingStr
        }
    }

    /**
     * Checks if parsing is completed
     * @returns true if parsing is completed
     */
    public isParsingCompleted(): boolean {
        return this._outputParsed
    }

    /**
     * Returns parsed output string
     * @returns parsed output string
     */
    public getParsedOutput(): string {
        return this._outputStr
    }

    /**
     * Parses the input xml and returns the parsed output
     * @param input xml input
     * @returns parsed output
     */
    private updateParsedOutput(input: string): string {
        while (input.includes("\n>>>>")) {
            input = input.replace("\n>>>>", "")
        }
        while (input.includes(">>>>")) {
            input = input.replace(">>>>", "")
        }

        //Return in case of empty input
        if (!input) return ""

        //Surround input within a tag to keep saxparser happy
        input = "<xml>" + input + "</xml>"

        let output = ""
        let has_output_resumed = false
        let has_tsp_node_started = false
        let tag_count = 0

        const parser: SAXParser = new SAXParser(false, {})

        parser.onopentag = function (node: { name: string | string[] }) {
            if (
                has_tsp_node_started &&
                (node.name.includes("RESUME") ||
                    node.name.includes("SESSION-BEGIN"))
            ) {
                has_output_resumed = true
            }

            if (node.name.includes(OutputParser.xml_tsp_tag)) {
                has_output_resumed = false
                has_tsp_node_started = true
            }
            tag_count = tag_count + 1
        }

        parser.onclosetag = function (tag_name: string | string[]) {
            if (tag_name.includes(OutputParser.xml_tsp_tag)) {
                has_tsp_node_started = false
            }

            tag_count = tag_count - 1
        }

        parser.ontext = function (content: string) {
            if (has_output_resumed) {
                output = output.concat(content)
            } else if (tag_count == 1) {
                outer: {
                    let element_found = false
                    OutputParser.exception_list.forEach((element) => {
                        if (content.includes(element)) {
                            element_found = true
                        }
                    })
                    if (element_found) {
                        break outer
                    }

                    content = content.replaceAll("\n", "")
                    output = output.concat(content)
                }
            }
        }

        OutputParser.exception_list.forEach((element) => {
            if (input.includes(element)) {
                input = input.replaceAll(`${element}\n`, `${element}`)
            }
        })

        parser.write(input)
        return output
    }
}
