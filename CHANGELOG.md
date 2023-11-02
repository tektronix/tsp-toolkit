# Change Log

All notable changes to the "teaspoon" extension will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


<!--
Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

    Added -- for new features.
    Changed -- for changes in existing functionality.
    Deprecated -- for soon-to-be removed features.
    Removed -- for now removed features.
    Fixed -- for any bug fixes.
    Security -- in case of vulnerabilities.
-->

<!--## Unreleased
    ### Removed debugger implementation
 -->

## [v0.9.2]
[v0.9.2 Release Page]

### Added
- Add and remove saved instruments in the instrument pane

### Changed
- Update Trebuchet firmware update procedure


## [v0.9.1]
[v0.9.1 Release Page]

### Added
- User will be able to save discovered instrument in the instrument explorer

### Changed
- Start debugging only if connected to instrument (TSP-378)

## [v0.8.2]
[v0.8.2 Release Page]

### Added
- Automatically enable lua language library for the connected instrument and tsplink nodes (TSP-358)

### Changed
- Changed JSON-RPC TS package; fixes vulnerabilities coming from the older package (TSP-224)
- Updated outdated README.md and CONTRIBUTING.md files (TSP-224)
- Handle closing of kic when user doesn't enter .exit in the terminal (TSP-224)

## [v0.8.1]
[v0.8.1 Release Page]

### Changed
- Invalid Watchpoint expression data also shown in UI (TSP-186)

## [v0.8.0]
[v0.8.0 Release Page]

### Changed
- Watchpoint expressions are updated as user adds an expression in Watch pane and also expression are updated for every stack frame. (TSP-271)

### Added
- node[N].{node configured model command} support has been added(TSP-336)

## [v0.7.1]
[v0.7.1 Release Page]


## [v0.7.0]
[v0.7.0 Release Page]

### Added
- Communication: Added context menu for firmware upgrade (TSP-294)
- User will be able to set expression/value of structured variable e.g table (TSP-311)
- vscode pops up an error when user tries to set wrong value to a variable (TSP-320)

## [v0.6.2]
[v0.6.2 Release Page]

### Added
- Debugger: Expand structured variables (TSP-296)

## [v0.6.1]
[v0.6.1 Release Page]

### Added
- Language: View "Command help" Hyperlink Option Added for all TSP Command Help Definitions (TSP-291)

## [v0.6.0]
[v0.6.0 Release Page]

### Added
- Language: Add 2600-series command-set definitions (TSP-240)
- Debugger: User will be able to set variable value from "Variables" pane (TSP-228)

### Fix
- Debugger: Runtime exceptions will now break execution before terminating debug session (TSP-231)

## [v0.5.2]
[v0.5.2 Release Page]

### Added
- Extract and show runtime exception during debugging (TSP-183)
- User will be able to terminate debuggee (TSP-178)
- User will be able to set variable value (TSP-243)

## [v0.5.1]
[v0.5.1 Release Page]

### Added
- Added ability to send scripts to all connected instruments (TSP-192)

## [v0.5.0]
[v0.5.0 Release Page]

### Added
- Instrument connection support for debugging (TSP-25).

## [v0.4.2]
[v0.4.2 Release Page]

### Changed
- DebugAdapter will send each watchExpression only once to kiComms.

## [v0.4.1]
[v0.4.1 Release Page]

### Added
- User can enable/disable the appearance of functions in Variables pane
- Users will be able to add/remove watchpoints.

## [v0.4.0]
[v0.4.0 Release Page]

### Added
- Users are now be able to see call-stack. (TSP-161)
- Scopes and variables are updated whenever application breaks in debug mode. (TSP-166)
- Unit tests are added for Stack.
- Step-out request is implemented. (TSP-13)
- Users will be able to add/remove breakpoints when debug session is started.

### Changed
- Output is disabled when debugging.
- Stack implementation is seggregated from TspRuntime module.
- StepIn request using ki-comms' API.


--------------------------------------------------------------------------------

## [v0.3.2]
[v0.3.2 Release Page]

### Added
- Lua Language feature are enabled using Lua extension dependency
- Experimental debugger (instrument IP in settings)

### Fixed
- Fix issue where user would be prompted for a password if an instrument took too long to respond

--------------------------------------------------------------------------------
## v0.3.0, v0.3.1

These releases did not work properly and have therefore been deleted.

--------------------------------------------------------------------------------

## [v0.2.3]
[v0.2.3 Release Page]

### Added
- Users can now edit the saved name of an instrument with right-click menu in the instrument pane

### Changed
- Format of saved instruments within settings
    - This will require a user to delete their saved instruments. This can be done by hitting <kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>P</kbd> and typing "Preferences: Open User Settings (JSON)". Delete everything inside `"kic.connectionList": [...]`
- Extension now begins discovery on after VSCode finishes starting up.

### Removed
- `KIC: Open Terminal IP` command from command palette.
- `KIC: Start Discovery` command from command palette (this is now handled from instrument pane)

### Fixed
- Instrument output is buffered until prompt is seen (TSP-139)
- TSP progress indicator (`>>>>`) fills screen

--------------------------------------------------------------------------------

## [v0.2.2]
[v0.2.2 Release Page]

### Added
- Experimental USBTMC support (TSP-102, TSP-137)

### Changed
- Discovery improvements (TSP-137, TSP-87)

### Fixed
- Prompt not shown after command that does't have output (TSP-134)
- Instrument with `-` in the name is unable to connect (TSP-132)

--------------------------------------------------------------------------------

## [v0.2.1]
[v0.2.1 Release Page]

### Changed
- Added support for TSPop as a model by defaulting to `2606B`(TSP-133)

--------------------------------------------------------------------------------

## [v0.2.0]
[v0.2.0 Release Page]
### Added
- Fully asynchronous LAN communication (TSP-20)
- Change `*LANG` to `TSP` if `*LANG?` returns something not `TSP` (TSP-71)
- Logout of an instrument when exiting (TSP-109)

### Changed
- Change CLI parameters to make room for USB (TSP-107)
- Change special commands to be of the form `.<command>` (e.g. `.help`, `.script`, `.exit`) (TSP-108)
- Save connected instruments to package.json (TSP-111)
- Display discovered instruments as they are found (TSP-111)
- Discovery completed over all interfaces and service names simultaneously (TSP-120)
- Load script by name, enabling multiple scripts to be loaded (TSP-112)

--------------------------------------------------------------------------------

## [v0.1.0]
[v0.1.0 Release Page]
## Added
- Instrument Discover (LAN)
- Instrument Connection (LAN)
    - Send script to instrument (right-click menu within editor or file-explorer)
    - Log in to password protected instrument (password prompt)

--------------------------------------------------------------------------------

[Unreleased]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/tree/dev
[v0.9.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.9.1...v0.9.2?from_project_id=18
[v0.9.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.9.2
[v0.9.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.8.2...v0.9.1?from_project_id=18
[v0.9.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.9.1
[v0.8.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.8.1...v0.8.2?from_project_id=18
[v0.8.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.8.2
[v0.8.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.8.0...v0.8.1?from_project_id=18
[v0.8.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.8.1
[v0.8.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.7.1...v0.8.0?from_project_id=18
[v0.8.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.8.0
[v0.7.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.7.0...v0.7.1?from_project_id=18
[v0.7.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.7.0
[v0.7.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.6.2...v0.7.0?from_project_id=18
[v0.7.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.7.0
[v0.6.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.6.1...v0.6.2?from_project_id=18
[v0.6.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.6.2
[v0.6.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.6.0...v0.6.1?from_project_id=18
[v0.6.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.6.1
[v0.6.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.5.2...v0.6.0?from_project_id=18
[v0.6.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.6.0
[v0.5.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.5.1...v0.5.2?from_project_id=18
[v0.5.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.5.2
[v0.5.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.5.0...v0.5.1?from_project_id=18
[v0.5.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.5.1
[v0.5.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.4.2...v0.5.0?from_project_id=18
[v0.5.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.5.0
[v0.4.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.4.1...v0.4.2?from_project_id=18
[v0.4.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.4.2
[v0.4.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.4.0...v0.4.1?from_project_id=18
[v0.4.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.4.1
[v0.4.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.3.2...v0.4.0?from_project_id=18
[v0.4.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.4.0
[v0.3.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.2.3...v0.3.2?from_project_id=18
[v0.3.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.3.2
[v0.2.3]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.2.2...v0.2.3?from_project_id=18
[v0.2.3 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.2.3
[v0.2.2]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.2.1...v0.2.2?from_project_id=18
[v0.2.2 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.2.2
[v0.2.1]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.2.0...v0.2.1?from_project_id=18
[v0.2.1 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.2.1
[v0.2.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v0.1.0...v0.2.0?from_project_id=18
[v0.2.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.2.0
[v0.1.0]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/tree/v0.1.0
[v0.1.0 Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/v0.1.0
