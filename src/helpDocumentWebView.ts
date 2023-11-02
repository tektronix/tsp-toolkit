import path = require("path")
import * as fs from "fs"
import * as vscode from "vscode"
import * as cheerio from "cheerio"
import { WEB_HELP_FILE_PATH } from "@trebuchet/web-help-documents"

/**
 * Responsibility of this class is to create the webview panel
 * and reflect it in vscode
 */
export class HelpDocumentWebView {
    private static currentPanel: vscode.WebviewPanel | undefined
    static context: vscode.ExtensionContext
    public static createOrShow(context: vscode.ExtensionContext) {
        this.context = context
        this.context.subscriptions.push(
            vscode.commands.registerCommand(
                "kic.viewHelpDocument",
                (helpfile: string) => {
                    this.getHelpDocumentContent(helpfile)
                }
            )
        )
    }
    /**
     * check for current webview pane and decide needs to create
     * or update existing one
     * @param helpfile html file name
     */
    private static getHelpDocumentContent(helpfile: string) {
        if (
            HelpDocumentWebView.currentPanel &&
            HelpDocumentWebView.currentPanel.title == helpfile
        ) {
            HelpDocumentWebView.currentPanel.reveal(this.getViewColumn(), true)
        } else if (
            HelpDocumentWebView.currentPanel &&
            HelpDocumentWebView.currentPanel.title != helpfile
        ) {
            HelpDocumentWebView.currentPanel.title = helpfile
            HelpDocumentWebView.currentPanel.webview.html =
                this.generateWebviewContent(helpfile)
            HelpDocumentWebView.currentPanel.reveal(this.getViewColumn(), true)
        } else {
            const options = {
                localResourceRoots: [
                    vscode.Uri.joinPath(vscode.Uri.file(WEB_HELP_FILE_PATH)),
                ],
            }
            const panel = vscode.window.createWebviewPanel(
                "helpFileWebView",
                helpfile,
                { viewColumn: this.getViewColumn(), preserveFocus: true },
                options
            )

            panel.onDidDispose(
                () => {
                    HelpDocumentWebView.currentPanel = undefined
                },
                null,
                this.context.subscriptions
            )

            HelpDocumentWebView.currentPanel = panel
            HelpDocumentWebView.currentPanel.webview.html =
                this.generateWebviewContent(helpfile)
        }
    }

    /**
     * check active text editor position and decide where
     * to reveal webview
     * @returns vscode.ViewColumn number
     */
    private static getViewColumn(): vscode.ViewColumn {
        if (vscode.window.activeTextEditor) {
            if (
                vscode.window.activeTextEditor.viewColumn ==
                vscode.ViewColumn.One
            ) {
                return vscode.ViewColumn.Two
            }
        }
        return vscode.ViewColumn.One
    }
    /**
     * Read web help file and update it so that it should
     * work with vscode webview
     * @param htmlFileName file name of web help file.
     * @return html string
     */
    private static generateWebviewContent(htmlFileName: string): string {
        const filePath = path.join(WEB_HELP_FILE_PATH, htmlFileName)
        if (!fs.existsSync(filePath)) {
            return `
            <!DOCTYPE html>
            <html lang="en">
            <head></head>
            <body>
            <h1>Not Found doc/${htmlFileName}</h1>
            </body>
            </html>`
        }

        // below style applies to image tag
        const style = `
        <style>
		.magicfigurecenter {
			position: relative;
			display: inline-block;
		}

		.magicfigurecenter::before {
			content: "";
			background-color: rgba(242, 242, 242, 0.5); /* Change the color and opacity as needed */
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: -1;
		}
        </style>`

        const fileContent = fs.readFileSync(filePath, "utf-8")

        // Load the HTML into cheerio
        const document = cheerio.load(fileContent)
        document("head").html(style)

        // find the table with previous and next button and remove it
        document("table").remove(".relatedtopics")
        // Find all elements with a `bgcolor` attribute and remove it
        document("[bgcolor]").removeAttr("bgcolor")

        let html = document.html()

        document("img, script").each((index, element) => {
            const src = document(element).attr("src")
            if (src) {
                const uri =
                    HelpDocumentWebView.currentPanel?.webview.asWebviewUri(
                        vscode.Uri.file(path.join(WEB_HELP_FILE_PATH, src))
                    )
                html = html.replace(src, uri?.toString() || src)
            }
        })
        return html
    }
}
