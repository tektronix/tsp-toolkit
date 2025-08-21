import * as xmlConvert from "xml-js"
import { plainToInstance } from "class-transformer"
import { StacksInfo } from "./debugResourceManager"
import { Log } from "./logging"

/**CallStack class maintains stackFrame informations
 */
export class CallStack {
    private _conversionCompleted = false
    private _conversionStarted = false
    /**_concatStr will accomulate stack data chunks*/
    private _concatStr = ""
    /**_stacksFrameInfo will be an instance of  StacksInfo*/
    private _stacksFrameInfo: StacksInfo | undefined

    /**isConversionStarted returns state conversion start */
    public isConversionStarted() {
        return this._conversionStarted
    }

    /**isConversionCompleted returns state conversion end */
    public isConversionCompleted() {
        return this._conversionCompleted
    }

    /**
     * collectDataChunk will collect the trail of data chunks, one at a time
     *
     * @param strChunk The chunk to be cleaned up and added to the stream of chunks
     */
    public collectDataChunk(strChunk: string) {
        this._conversionCompleted = false
        strChunk = strChunk.replaceAll("TSP> ", "")
        this._concatStr = this._concatStr.concat(strChunk)
        // If _concatStr has "</stacks>" and "</stacks>" both
        if (
            this._concatStr.includes("<stacks>") &&
            this._concatStr.includes("</stacks>")
        ) {
            const remainingStr = this._concatStr.substring(
                this._concatStr.indexOf("</stacks>") + "</stacks>".length,
            )
            this._concatStr = this._concatStr.substring(
                this._concatStr.indexOf("<stacks>"),
                this._concatStr.indexOf("</stacks>") + "</stacks>".length,
            )
            this.convertStackXmlStrToJson(this._concatStr)

            this._concatStr = remainingStr
            this._conversionStarted = false
            this._conversionCompleted = true
        }
        // coversion not started and _concatStr has "<stacks>"
        else if (
            !this._conversionStarted &&
            this._concatStr.includes("<stacks>")
        ) {
            this._conversionStarted = true
            this._concatStr = this._concatStr.substring(
                this._concatStr.indexOf("<stacks>"),
            )
        }
    }

    /**
     * convertStackXmlStrToJson will convert the xmlString to StacksInfo instance
     *
     *  @param callStackStr : callStackStr is from <stacks> to </stacks> tags in string format.
     */
    public convertStackXmlStrToJson(callStackStr: string) {
        try {
            const convertStr = xmlConvert.xml2js(callStackStr, {
                compact: true,
                trim: true,
                alwaysArray: true,
            })
            this._stacksFrameInfo = plainToInstance(StacksInfo, convertStr)
        } catch (error) {
            Log.error(new String(error).toString(), {
                file: "callStack.ts",
                func: "CallStack.convertStackXmlStrToJson",
            })
        }
    }
    /**getStackFrames function returns the stackFrame information */
    public getStackFrames(): StacksInfo | undefined {
        return this._stacksFrameInfo
    }
}
