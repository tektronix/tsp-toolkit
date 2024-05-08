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

## [0.15.3]

### Fixed

- Corrected extension description
- Remove `:` from port number
- Adding tsplink nodes in config.tsp.json file does not load definitions for added node lua table

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

<!--Version Comparison Links-->
[Unreleased]: https://github.com/tektronix/tsp-toolkit/compare/v0.15.3...HEAD
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
