import { SAXParser } from "sax-ts"

//Responsible for parsing xml output to display
//the tsp script output in the VS Code Output terminal
export class OutputParser {
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

    //Returns the parsed output of the input xml
    public getParsedOutput(input: string): string {
        while (input.includes("\n>>>>")) {
            input = input.replace("\n>>>>", "")
        }
        while (input.includes(">>>>")) {
            input = input.replace(">>>>", "")
        }

        //Return in case of empty input
        if (!input) return ""

        //console.log(input)
        //Surround input within a tag to keep saxparser happy
        input = "<xml>" + input + "</xml>"

        let output = ""
        let has_output_resumed = false
        let has_tsp_node_started = false
        let tag_count = 0

        const parser: SAXParser = new SAXParser(false, {})

        parser.onopentag = function (node: { name: string | string[] }) {
            // @typescript-eslint/no-unsafe-call
            if (
                has_tsp_node_started &&
                (node.name.includes("RESUME") ||
                    node.name.includes("SESSION-BEGIN"))
            ) {
                has_output_resumed = true
            }

            // @typescript-eslint/no-unsafe-call
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
            } else if (tag_count === 1) {
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
