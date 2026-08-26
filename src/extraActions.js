// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

window.addEventListener("load", main)

// Set up an event listener to listen for messages passed from the extension context
async function waitForEventWith(predicate) {
  return new Promise((res, rej) => {
    const event_listener = (event) => {
        if (predicate(event.data)) {
            window.removeEventListener("message", event_listener)
            res()

        }
    }
    window.addEventListener("message", event_listener);
  })
}

async function fetchExamples() {
    return new Promise(async (resolve, reject) => {
        vscode.postMessage({command: "fetchExamples"})
        await waitForEventWith((data) => {data.command === "fetchComplete"})
        resolve()
    })
}

async function main() {
    const fetchExamplesButton = document.getElementById("fetchExamples")

    fetchExamplesButton.addEventListener("click", async (event) => {
        fetchExamplesButton.disabled = true
        await fetchExamples()
        fetchExamplesButton.disabled = false
    })
}
