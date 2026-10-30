import { inspect, promisify } from "util"
import { platform } from "node:os"
import { execFile } from "child_process"
import * as vscode from "vscode"
import { Log, SourceLocation } from "./logging"
import { EXECUTABLE, VISA_EXECUTABLE } from "./kic-cli"

const execFileAsync = promisify(execFile)

const LOGLOC: SourceLocation = {
    file: "dependencyChecker.ts",
    func: "",
}

// platform() comes from Node.js. i.e. import { platform } from "os"
// It returns a string identifying the OS the Node.js process is running on.
// Common return values:
// "win32" → Windows (even 64-bit Windows)
// "darwin" → macOS
// "linux" → Linux
export const isWindows = platform() === "win32"
export const isMacOS = platform() === "darwin"
export const isLinux = platform() === "linux"

const STARTUP_PROBE_TIMEOUT_MS = 10_000
const CONNECTION_PROBE_TIMEOUT_MS = 5_000

/**
 * Check if Visual C++ Redistributable libraries are installed on Windows
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkVisualCppRedistributable(): Promise<boolean> {
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        // look for kic.exe in the binaries and run kic.exe --version, if successfull, C++ is installed
        console.log("Checking Visual C++ Redistributable...")
        const { stdout } = await execFileAsync(EXECUTABLE, ["--version"], {
            timeout: STARTUP_PROBE_TIMEOUT_MS,
        })
        Log.debug(`Visual C++ Redistributable check succeeded: ${stdout}`, {
            ...LOGLOC,
            func: "checkVisualCppRedistributable()",
        })
        return true
    } catch (error) {
        Log.error(
            `Error checking Visual C++ Redistributable: ${inspect(error)}`,
            {
                ...LOGLOC,
                func: "checkVisualCppRedistributable()",
            },
        )
        return false
    }
}

/**
 * Check if VISA is installed on Windows
 *
 * @returns Promise<boolean> - true if VISA is properly installed, false otherwise
 * @note VISA is optional. Users can use LAN instruments without it.
 * @note Only x64 DLL is checked since VS Code is x64-only
 */
export async function checkVisaInstallation(
    timeoutMs = CONNECTION_PROBE_TIMEOUT_MS,
): Promise<boolean> {
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        // run kic-visa.exe --version, if successfull, VISA is installed
        console.log("Checking VISA Installation...")
        const { stdout } = await execFileAsync(VISA_EXECUTABLE, ["--version"], {
            timeout: timeoutMs,
        })
        Log.debug(`VISA Installation detected: ${stdout}`, {
            ...LOGLOC,
            func: "checkVisaInstallation()",
        })
        return true
    } catch (error) {
        Log.error(`Error checking VISA installation: ${inspect(error)}`, {
            ...LOGLOC,
            func: "checkVisaInstallation()",
        })
        return false
    }
}

/**
 * Check if VISA is installed on Linux
 *
 * @returns Promise<boolean> - true if VISA library found, false otherwise
 * @note VISA is optional. Users can use LAN instruments without it.
 */
export async function checkVisaInstallationLinux(
    timeoutMs = CONNECTION_PROBE_TIMEOUT_MS,
): Promise<boolean> {
    if (!isLinux) {
        return true // skip for non-Linux platforms
    }
    try {
        // execFile rejects if kic-visa cannot load the VISA library or exits non-zero.
        const { stdout } = await execFileAsync(VISA_EXECUTABLE, ["--version"], {
            timeout: timeoutMs,
        })
        Log.debug(`VISA Installation detected: ${stdout}`, {
            ...LOGLOC,
            func: "checkVisaInstallationLinux()",
        })
        return true
    } catch (error) {
        Log.warn(`VISA Installation not detected: ${inspect(error)}`, {
            ...LOGLOC,
            func: "checkVisaInstallationLinux()",
        })
        return false
    }
}

interface MissingDependency {
    name: string
    description: string
    downloadUrl: string
    learnMoreUrl?: string
    optional?: boolean
}

/**
 * Check if GLIBC version is 2.39 or higher on Linux
 * @returns Promise<boolean> - true if GLIBC >= 2.39, false otherwise
 */
export async function checkGlibcVersion(): Promise<boolean> {
    if (!isLinux) {
        return true // skip for non-Linux platforms
    }

    const REQUIRED_MAJOR = 2
    const REQUIRED_MINOR = 39

    // Helper function to check if version is sufficient (>= 2.39)
    const isVersionSufficient = (versionString: string): boolean => {
        const versionMatch = versionString.match(/(\d+)\.(\d+)/)
        if (versionMatch) {
            const major = parseInt(versionMatch[1])
            const minor = parseInt(versionMatch[2])

            // Check if version >= 2.39
            return (
                major > REQUIRED_MAJOR ||
                (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR)
            )
        }
        return false
    }

    try {
        // List of commands to try for getting GLIBC version
        const commands: Array<[string, string[]]> = [
            ["getconf", ["GNU_LIBC_VERSION"]],
            ["ldd", ["--version"]],
        ]

        // Try each command in sequence
        for (const [cmd, args] of commands) {
            try {
                const { stdout } = await execFileAsync(cmd, args, {
                    timeout: 3000,
                })
                if (isVersionSufficient(stdout)) {
                    return true
                }
            } catch {
                // Continue to next command
                continue
            }
        }

        return false
    } catch (error) {
        Log.error(`Error checking GLIBC version: ${String(error)}`, {
            ...LOGLOC,
            func: "checkGlibcVersion()",
        })
        return false
    }
}

/**
 * Show an interactive menu to browse and take action on missing dependencies
 */
async function showDependencyDetailsMenu(
    missing: MissingDependency[],
): Promise<void> {
    while (true) {
        // Create QuickPick items for each dependency
        const items = missing.map((dep) => ({
            label: `$(warning) ${dep.name}`,
            description: dep.description,
            detail: "Click to download or learn more",
            dep: dep,
        }))

        // Add a "Done" option to exit the menu
        const doneItem = {
            label: "$(check) Done",
            description: "Close this menu",
            detail: "",
            dep: null as MissingDependency | null,
        }

        const allItems = [...items, doneItem]

        const chosen = await vscode.window.showQuickPick(allItems, {
            placeHolder: `${missing.length} missing ${missing.length === 1 ? "dependency" : "dependencies"} - Select one to view options`,
            title: "Missing Dependencies",
            ignoreFocusOut: true,
        })

        // User cancelled or clicked Done
        if (!chosen || !chosen.dep) {
            break
        }

        // Show actions for the selected dependency
        const actions: string[] = ["$(cloud-download) Download"]
        if (chosen.dep.learnMoreUrl) {
            actions.push("$(info) Learn More")
        }
        actions.push("$(arrow-left) Back to List")

        const action = await vscode.window.showQuickPick(actions, {
            placeHolder: `${chosen.dep.name} - ${chosen.dep.description}`,
            title: `Actions for ${chosen.dep.name}`,
            ignoreFocusOut: true,
        })

        if (action?.includes("Download")) {
            await vscode.env.openExternal(
                vscode.Uri.parse(chosen.dep.downloadUrl),
            )
            // Show confirmation and continue
            await vscode.window.showInformationMessage(
                `Opening ${chosen.dep.name} download page in your browser...`,
            )
            continue
        } else if (action?.includes("Learn More") && chosen.dep.learnMoreUrl) {
            await vscode.env.openExternal(
                vscode.Uri.parse(chosen.dep.learnMoreUrl),
            )
            // Show confirmation and continue
            await vscode.window.showInformationMessage(
                `Opening ${chosen.dep.name} information page in your browser...`,
            )
            continue
        } else if (!action || action.includes("Back")) {
            // User wants to go back to the list, continue the loop
            continue
        } else {
            // User cancelled, go back to list
            continue
        }
    }
}

/**
 * Show a consolidated notification for all missing dependencies
 */
async function showMissingDependenciesNotification(
    missing: MissingDependency[],
): Promise<void> {
    if (missing.length === 0) {
        return
    }

    while (true) {
        // Build the message
        let message = ""
        let depList = ""

        const numRequired = missing.filter((dep) => !dep.optional).length
        const numOptional = missing.filter((dep) => dep.optional).length
        const hasRequired = numRequired > 0

        // Create a numbered list
        depList = missing
            .map((dep, index) => `${index + 1}. ${dep.name}`) // 1. Name, 2. Name, ...
            .join("\n")
        message = `TSP Toolkit: ${numRequired > 0 ? `${numRequired} required ${numOptional > 0 ? "and " : ""}` : ""}${numOptional > 0 ? `${numOptional} optional ` : ""}${missing.length === 1 ? "dependency is" : "dependencies are"} missing. Some features may not work correctly without required dependencies`

        if (!hasRequired) {
            message += "\n" + depList + "\n"
        }

        console.log(message)

        // Create action buttons based on number of dependencies
        const actions: string[] = []
        const actionMap = new Map<string, MissingDependency>()

        // Only show individual download buttons for single dependency
        if (missing.length === 1) {
            missing.forEach((dependency) => {
                const actionLabel = `Download ${dependency.name}`
                actions.push(actionLabel)
                actionMap.set(actionLabel, dependency)
            })
        }

        // For multiple dependencies, show Browse All instead of individual downloads
        if (missing.length > 1) {
            actions.push("Browse All")
        }

        actions.push("Dismiss")

        const messageApi = hasRequired
            ? vscode.window.showErrorMessage
            : vscode.window.showWarningMessage

        const selection = await messageApi(
            message,
            { modal: hasRequired, detail: depList },
            ...actions,
        )

        if (selection === "Dismiss" || !selection) {
            // User dismissed the notification
            break
        } else if (selection === "Browse All") {
            // Show a persistent menu to browse all missing dependencies
            await showDependencyDetailsMenu(missing)
            // After menu closes, loop back to show notification again
            continue
        } else if (selection) {
            // User clicked on a specific download button
            const dep = actionMap.get(selection)
            if (dep) {
                await vscode.env.openExternal(vscode.Uri.parse(dep.downloadUrl))
                // Show confirmation and loop back to notification
                await vscode.window.showInformationMessage(
                    `Opening ${dep.name} download page in your browser...`,
                )
                continue
            }
        }
    }
}

/**
 * Check all required dependencies for the current platform
 * and show notifications if any are missing
 */
export async function checkSystemDependencies(): Promise<void> {
    const logloc = { ...LOGLOC, func: "checkSystemDependencies()" }
    const missingDependencies: MissingDependency[] = []

    if (isWindows) {
        Log.debug("Checking Windows dependencies", logloc)

        // Check Visual C++ Redistributable
        const hasVCRedist = await checkVisualCppRedistributable()
        if (!hasVCRedist) {
            Log.warn("Visual C++ Redistributable not detected", logloc)
            missingDependencies.push({
                name: "Visual C++ Redistributable",
                description: "Required for native modules and performance",
                downloadUrl: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
                learnMoreUrl:
                    "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist",
            })
        } else {
            Log.debug("Visual C++ Redistributable detected", logloc)
        }

        // Check VISA installation (optional)
        const ignoreMissingVisa = vscode.workspace
            .getConfiguration("tsp")
            .get<boolean>("ignoreMissingVisa", false)
        const hasVisa = await checkVisaInstallation(STARTUP_PROBE_TIMEOUT_MS)
        if (!hasVisa && !ignoreMissingVisa) {
            Log.debug(
                "VISA not installed (optional - required only for VISA protocol support)",
                logloc,
            )
            missingDependencies.push({
                name: "VISA(Optional)",
                description:
                    "Optional - Required only for VISA protocol instrument communication",
                downloadUrl:
                    "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
                learnMoreUrl:
                    "https://www.ivifoundation.org/specifications/default.aspx",
                optional: true,
            })
        } else {
            Log.debug("VISA installation detected", logloc)
        }

        // Show consolidated notification for all missing dependencies
        if (missingDependencies.length > 0) {
            await showMissingDependenciesNotification(missingDependencies)
        }

        // Add more Windows dependency checks here
    } else if (isMacOS) {
        Log.debug("Checking macOS dependencies", logloc)
        // Add macOS dependency checks here
    } else if (isLinux) {
        Log.debug("Checking Linux dependencies", logloc)

        // Check GLIBC version
        const hasGlibc239 = await checkGlibcVersion()
        if (!hasGlibc239) {
            Log.warn("GLIBC version is less than 2.39", logloc)
            missingDependencies.push({
                name: "GLIBC >= 2.39",
                description:
                    "Required for compatibility with modern features. Your system has an older version.",
                downloadUrl: "https://www.gnu.org/software/libc/",
                learnMoreUrl: "https://www.gnu.org/software/libc/libc.html",
            })
        } else {
            Log.debug("GLIBC version is 2.39 or higher", logloc)
        }

        // Check VISA installation (optional)
        const ignoreMissingVisa = vscode.workspace
            .getConfiguration("tsp")
            .get<boolean>("ignoreMissingVisa", false)
        const hasVisaLinux = await checkVisaInstallationLinux(
            STARTUP_PROBE_TIMEOUT_MS,
        )
        if (!hasVisaLinux && !ignoreMissingVisa) {
            Log.debug(
                "VISA not installed (optional - required only for VISA protocol support)",
                logloc,
            )
            missingDependencies.push({
                name: "VISA(Optional)",
                description:
                    "Optional - Required only for VISA protocol instrument communication",
                downloadUrl:
                    "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
                learnMoreUrl:
                    "https://www.ivifoundation.org/specifications/default.aspx",
                optional: true,
            })
        } else {
            Log.debug("VISA installation detected on Linux", logloc)
        }

        // Show consolidated notification for all missing dependencies
        if (missingDependencies.length > 0) {
            await showMissingDependenciesNotification(missingDependencies)
        }

        // Add more Linux dependency checks here
    }
}
