# Keithley TSP® Toolkit

The Keithley TSP® Toolkit is a [Visual Studio Code][code] extension that provides rich
support for Keithley's Test Script Processor ([TSP][tsp]) technology to edit and execute
scripts. The extension includes command-set documentation and language features such as
syntax error detection and code navigation (provided by [sumneko.lua][sumneko]) as well as
code-completion suggestions, inline help, and TSP command documentation.

## Installed Extensions

[Keithley TSP Toolkit][tsp-toolkit] will automatically install the [sumneko.lua][sumneko]
extension to use all of the language features it provides.

Extensions installed through the marketplace are subject to the [Marketplace Terms of Use][marketplace-tou].

## Quick Start

- **Step 1.** Connect your TSP-enabled Keithley instrument to your local network (LAN).
- **Step 2.** Install the [Keithley TSP Toolkit Visual Studio Code Extension][tsp-toolkit-marketplace].
- **Step 3.** Open or create a folder for your TSP project.

    ![Open Folder][pic-open-folder]

- **Step 4.** [Configure your project](#configure-your-project) for your [TSP-Link®][tsp-link] instrument configuration.
- **Step 5.** Edit and run your TSP scripts by right-clicking them in the file explorer,
              file tabs, or editor window and selecting "Send Script to Terminal"

    ![Send Script to Terminal][pic-send-script-to-terminal]

## Useful Commands

Open the Command Pallette (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS and
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on Windows or Linux), then type one of the
following commands:

| Command                          | Description                                                                         | Shortcut                                        |
|:---------------------------------|:------------------------------------------------------------------------------------|:------------------------------------------------|
| TSP: Open Terminal               | Opens a new terminal session to an instrument                                       |                                                 |
| TSP: Send Script to Terminal     | Sends the script in the current editor window to the currently connected instrument |                                                 |

To see all available Keithley TSP Toolkit commands, open the Command Pallette and type `TSP`.

To see all available context-sensitive options, right-click on your active editor window while a `*.tsp` file is open:

| Context-Sensitive Option     | Description                                                                                   |
|:-----------------------------|:----------------------------------------------------------------------------------------------|
| Send Script to All Terminals | Send the current script to all the currently connected instruments with active terminals open |
| Send Script to Terminal      | Send the current script to the currently connected instrument                                 |


## Configure Your Project

There are two ways to configure your project to have language features for your TSP-Link
node network: Automatic or Manual.
After completing either method, you will be shown relevant code completion suggestions,
signature help, and documentation for the instruments in your TSP-Link network.

### Automatic Configuration

If you are already connected to a physical instrument with your TSP-Link network configured,
then it is possible to have TSP Toolkit automatically configure your project for you.

1. Open any workspace folder in VSCode
2. If your workspace folder does not already contain one, create a .tsp (for example `my-tsp-file.tsp`)
3. Connect to your instrument using the discovery pane or the `TSP: Open Terminal` command.
4. Right-click on the `.tspConfig` folder
5. Select "Fetch TSP-Link Nodes for Connected Instrument"


### Manual Configuration

1. Open any workspace folder in VSCode
2. If your workspace folder does not already contain one, create a .tsp (for example `my-tsp-file.tsp`)
3. Open `.tspConfig/config.tsp.json`
4. Enter your instrument model name for the `"self"` attribute in the JSON.



## Resources and Tutorials

- [TSP Landing Page on Tek.com][tsp]
- [TSP Toolkit Feature Walkthrough][tsp-toolkit-feature-walkthrough]
- [TSP Video Series][tsp-video-series]
- [App Note: How to Write TSP Scripts for TSP][app-note-how-to-write-tsp-scripts]
- [TSP Script Example Repository][tsp-script-examples]

## Feature Details

The Keithley TSP Toolkit includes:

- **Language Features:** Write your code with the assistance of autocompletion and
  syntax checking
- **Hover Help:** Access detailed information on individual commands such as definition,
  accepted parameters, and usage examples
- **Command Interface:** Send commands and interact directly with your instruments
  through the terminal
- **Instrument Autodiscovery:** Discover available instruments on your local network
- **Instrument Firmware Upgrade:** Remotely upgrade the instrument firmware

## Supported Locales

The extension is currently only available in English.


## Questions, Issues, Feature Requests, and Contributions
- If you come across a problem with the extension, please file an [issue][tsp-toolkit-issues]
- Contributions are always welcome! Please see our [contributing guide][tsp-toolkit-contributing]
  for more details.
- Any and all feedback is appreciated and welcome!
    - If someone has already filed an [issue][tsp-toolkit-issues] that encompasses your
      feedback, please leave a 👍/👎 reaction on the issue. Otherwise please start a new
      [discussion][tsp-toolkit-discussions]
- If you're interested in the development of the extension, your can read about our
  [development process][tsp-toolkit-dev-process]


## Known Issues

As a beta product, we expect there to be some issues with this software and some features
may not be completed. Below is a list of known issues. If you come across new issues,
please let us know! See the [next section](#questions-issues-feature-requests-and-contributions)
for more information.

- Saved instruments do not persist across VSCode sessions
- Incomplete, incorrect, or missing command-sets, these items may be shown as errors in
  the editor, but will run on any instrument on which they exist. These commands may not
  be shown in completion suggestions or the completions may be incorrect.
    - All instruments
        - `acal.*`
        - `beeper.*`
        - `dataqueue.*`
        - `display.*`
        - `eventlog.*`
        - `file.*`
        - `fs.*`
        - `lan.*`
        - `status.*`
        - `tsplink.*`
        - `tspnet.*`
        - `upgrade.*`
        - `userstring.*`
    - 2600-series instruments
        - `bit.*`
        - `errorqueue.*`
        - `io.*`
        - `serial.*`
- Discovery feature updates the settings.json and discovery pane too frequently. This
  causes tooltips to be closed too quickly and can also cause flickering.
- Attempting to connect to an instrument multiple times with the different names, the
  second connection will fail, but the name will change.

<!--Refs-->
[app-note-how-to-write-tsp-scripts]: https://www.tek.com/en/documents/application-note/how-to-write-scripts-for-test-script-processing-(tsp)
[code]: https://code.visualstudio.com/
[marketplace-tou]: https://cdn.vsassets.io/v/M146_20190123.39/_content/Microsoft-Visual-Studio-Marketplace-Terms-of-Use.pdf
[sumneko]: https://marketplace.visualstudio.com/items?itemName=sumneko.lua
[tsp-link]: https://www.tek.com/en/video/product-features/what-is-tsp-link
[tsp-script-examples]: https://github.com/tektronix/keithley/
[tsp-toolkit-feature-walkthrough]: https://www.tek.com/
[tsp-toolkit-marketplace]: https://code.visualstudio.com/docs/editor/extension-gallery
[tsp-toolkit]: https://www.tek.com/
[tsp-toolkit-issues]: https://github.com/tektronix/tsp-toolkit/issues
[tsp-toolkit-contributing]: ./CONTRIBUTING.md
[tsp-toolkit-discussions]: https://github.com/tektronix/tsp-toolkit/discussions
[tsp-toolkit-dev-process]: ./CONTRIBUTING.md#development-process
[tsp-video-series]: https://www.youtube.com/@tektronix/search?query=TSP
[tsp]: https://www.tek.com/en/solutions/application/test-automation/tsp-for-test-automation

<!--Pics-->
[pic-send-script-to-terminal]: https://github.com/TEK-Engineering/tsp-toolkit/raw/dev/images/SendScriptToTerminal.png
[pic-open-folder]: https://github.com/TEK-Engineering/tsp-toolkit/raw/dev/images/OpenFolder.png
