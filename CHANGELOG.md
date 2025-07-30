# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

    Added -- for new features.
    Changed -- for changes in existing functionality.
    Deprecated -- for soon-to-be removed features.
    Removed -- for now removed features.
    Fixed -- for any bug fixes.
    Security -- in case of vulnerabilities.
-->
## [1.2.4]

### Changed
- Sanitize log files to remove sensitive information
### Fixed
- (**tsp-toolkit-kic-cli**) Unable to fetch TSPLink network information from Trebuchet
### Added
- (**tsp-toolkit-webhelp-to-json**) Language feature support has been added for MP5103, MPSU502ST and MSMU60-2
- (**tsp-toolkit-webhelp**) Added MP5103, MPSU502ST and MSMU60-2 webhelp documentation
- (**tsp-toolkit-kic-cli**) Add better password support
- (**tsp-toolkit-kic-cli**) Don't interrupt instruments while discovering instruments.
- Add abort menu to abort current job on the connected instrument

## [1.2.3]

### Fixed
- Deprecate old system configurations
- Node and slot table autocompletion problem
- System configurations UI controls alignment issues
- (**tsp-toolkit-kic-lib**) Further progress indicator improvements
- (**tsp-toolkit-kic-cli**) Recognize when socket has been terminated from device-side more quickly and close.

### Added
- Update support for already saved systems

### Changed
- Update branding to be Tektronix instead of Keithley

## [1.2.2]

### Added

- System configurations webview UI implemented
- slot input support for modules
- UI option to fetch localnode and tsplink nodes for active connection
- (**tsp-toolkit-kic-lib**) Progress indicators for very large scripts and firmware files

### Changed

- (**tsp-toolkit-kic-cli**) JSON structure updated to include module info
- (**tsp-toolkit-kic-cli**) Write fetched configuration to setting.json file
- (**tsp-toolkit-kic-lib**) No longer need to call `slot.stop` and `slot.start` since that is done by firmware now

### Fixed

- (**tsp-toolkit-kic-lib**) Issues with firmware updates over USBTMC on some instruments


## [1.2.1]

### Fixed

- Fix changes that broke advanced feature compatibility (closed beta)

### Changed

- Updated branding in README and package.json

## [1.2.0]

### Changed

- Major visual overhaul to the instruments pane

### Fixed

- Don't create a `.vscode` folder with `config.tsp.json` if the workspace folder does not
  contain a `.tsp` file.

### Added

- Optionally use `firmware.valid` attribute for applicable instruments to only run
  upgrade on valid firmware

## [1.1.1]

### Added
- support dynamically creating enums for configured nodes
- handling dynamically creating enums for trigger.model.setblock() command parameter

### Changed

- Change location of TSP Resources sections in Walkthrough and README

### Fixed
- making sure that node[N].execute(), node[N].getglobal() and node[N].setglobal() only
  visible in TSP-Link systems
- **tsp-toolkit-kic-cli:** be sure not to call TSP commands when getting instrument
  information since the instrument (TTI) could be in a non-TSP language mode.
- **tsp-toolkit-kic-cli:** change the language of an instrument when getting instrument
  information

## [1.1.0]

### Added

- Added `tsp.dumpQueueOnConnect` setting to dump the instrument output queue before
  clearing it so it can be printed when opening the terminal
- Added progress indication to connection notification

### Changed

- Discover will use LXI identification page to get instrument information instead of `*IDN?`

### Fixed

- Fixed Readme links and worked around markdown parser error
- Close and reset instrument connections when extension is deactivated


## [1.0.0]

### Added

- Add reset menu to reset instrument from the instruments list

### Fixed
- Fix issue with error propagation of send script to terminal command
- Fix issue where connecting to an instrument can fail with a mysterious error message
- Connection name needs to be same in Instruments pane, terminal and quick pick for a given instrument connection


## [0.18.2]

### Added

- Added walkthrough document
- Added macOS support (LAN only)
- Added file logging for extension code

### Changed

- Change TSP view container icon to improve visibility
- Change TSP terminal icon to improve visibility

### Fixed

- **tsp-toolkit-kic-cli**: Only call `readSTB` after a command or script is written to
  the instrument
- When entering only visa instrument address, connection is saved with correct model and serial number (TSP-839)

### Removed

- Removed VSCode Output pane logging

## [0.18.1]

### Added

- Support for lua 5.0 library

### Changed

- Updated sub commands help text

### Fixed

- Showing correct model and serial number information instead of undefined (TSP-809)

## [0.18.0]

### Fixed

- Many notification at TSP Toolkit Activation
- Make *.tsp=lua file association a User-level setting instead of a workspace setting


### Added

- Added VISA support for connecting to an instrument
- Added platform-specific extension versions for Windows x86\_64 and Linux x86\_64 systems
- Added a + button to the Instruments pane title bar
- Added icon to tsp-toolkit connection terminal
- Added run button to runs the current script
- **tsp-toolkit-webhelp-to-json:** Added language feature support for 2651A, 2657A and 2601B-PULSE models
- **tsp-toolkit-webhelp:** Added webhelp documents for 2651A, 2657A and 2601B-PULSE models

### Changed

- Automatically assume a new connection is desired if the input to the "TSP: Connect" input box
  has no results and is a valid connection string.


### Removed

- Raw USBTMC support has been removed in favor of VISA

## [0.17.0]

### Fixed

- Successful connection to tspop adds the instrument details to Instruments pane (TSP-773)
- **tsp-toolkit-kic-cli:** Fixed an indexing issue for upgrading module firmware (TSP-761) *Open Source Contribution: c3charvat, amcooper181*

### Added

- Reset instrument if closed unexpectedly using the trashcan on the terminal (TSP-730)
- Add logging for terminal and discover
- Default friendly name if user doesn't provide one (TSP-757)

## [0.16.4]

### Changed

- "TSP: Open Terminal" command has been renamed to "TSP: Connect"
- "Open Terminal" should just open the terminal, not just in the command palette (TSP-464)

### Fixed

- Send script to all terminals is failing(TSP-598)
- **tsp-toolkit-kic-cli:** Renamed update to upgrade for firmware upgrade in CLI arguments (TSP-741)

## [0.16.1]

### Fixed

- If instrument connection address changes, it is updated in "Instruments" pane (TSP-634)
- Instrument tree is updated only when new instrument is discovered/saved/removed (TSP-634)
- Renamed update to upgrade for firmware upgrade (TSP-463)
- **tsp-toolkit-kic-cli:** renamed update to upgrade (TSP-463)
- **tsp-toolkit-kic-cli:** changed lxi and usb device info struct's instrument address field to same name (TSP-634)
- **tsp-toolkit-kic-cli:** Fix Support for FW flash on the 3706B and 70xB (_Open Source Contribution: c3charvat_)
- **tsp-toolkit-webhelp:** display.input.option() command signature has been corrected for all tti models


## [0.15.3]

### Fixed

- Corrected extension description
- Remove `:` from port number
- Adding tsplink nodes in config.tsp.json file does not load definitions for added node lua table
- Changed literal `\` to `path.join()` when populating config.tsp.json
- Remove debugger-related items from `package.json`
- **tsp-toolkit-kic-cli:** Fix issue where unrecognized model number causes kic-cli to never exit (TSP-645)
- **tsp-toolkit-kic-cli:** Fix issue in which the prompt would be displayed immediately after loading a script


## [0.15.2]

### Fixed

- Removed debugger related code from package.json (TSP-436)

## [0.15.1]

### Changed

- **tsp-toolkit-kic-lib:** Clean up instrument connections when an AsyncStream
  stream is dropped

### Fixed

- Only single entry per instrument in settings.json file, irrespective of number of times it is saved (TSP-616)
- **tsp-toolkit-kic-cli:** Remove errors when fetching nodes with `.nodes` command

### Security

- **tsp-toolkit-kic-cli:** Bump `h2` crate version

## [0.15.0]

### Fixed

- Saved instruments persist in the Instruments pane after restarting the extension (TSP-510)
- **tsp-tookit-kic-cli:** Change language to `TSP` after connection to TTI instrument (TSP-561)
- **tsp-toolkit-kic-cli:** Fix script name issues if the name contains special characters (TSP-505)
- **tsp-toolkit-kic-lib:** Use `*TST?` to check login state instead of
  `print("unlocked")` just in case we are in a SCPI command set mode.

## [0.14.1]

### Changed

- **kic-cli:** Prepend `kic_` to scripts loaded by kic cli to prevent name-collisions (TSP-505)

### Fixed

- **kic-cli:** Update Dependencies (TSP-576)
- **keithley-instrument-libraries:** Fix command-set issues for legacy instruments (TSP-569)

## [0.13.2]

### Changed

- Change references to `KIC` to be `TSP` instead, add additional Marketplace metadata (TSP-457)
- Prepare README.md for Marketplace (TSP-509)

### Added

- Added discovery progress message (TSP-504)

### Fixed

- Model number in TSP config is no longer case sensitive (TSP-514)


## [0.13.0]

### Added

- Added TSP Toolkit Logo (TSP-498)

## [0.12.2]

### Fixed

- Fix remove saved instrument issue (TSP-483)

## [0.12.1]

### Changed

- Restore password hide feature back after ki-comms refactor (TSP-363)
- Implement Password prompt (TSP-480)

### Fixed

- Extension wants a password when there isn't one (TSP-416)

## [0.12.0]

### Added

- Add message when starting FW upgrade (TSP-455)
- Feature to retrieve TSP-Link network details

<!-- Version Comparison Links -->
[Unreleased]: https://github.com/tektronix/tsp-toolkit/compare/v1.2.4...HEAD
[1.2.4]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.2.4
[1.2.3]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.2.3
[1.2.2]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.2.2
[1.2.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.2.1
[1.2.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.2.0
[1.1.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.1.1
[1.1.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.1.0
[1.0.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v1.0.0
[0.18.2]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.18.2
[0.18.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.18.1
[0.18.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.18.0
[0.17.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.17.0
[0.16.4]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.16.4
[0.16.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.16.1
[0.15.3]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.15.3
[0.15.2]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.15.2
[0.15.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.15.1
[0.15.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.15.0
[0.14.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.14.1
[0.13.2]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.13.2
[0.13.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.13.0
[0.12.2]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.12.2
[0.12.1]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.12.1
[0.12.0]: https://github.com/tektronix/tsp-toolkit/releases/tag/v0.12.0
