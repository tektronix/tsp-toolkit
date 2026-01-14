import { promisify } from "util"
import { platform } from "node:os"
import fs from "node:fs"
import { execFile } from "child_process"
import * as vscode from "vscode"
import { Log, SourceLocation } from "./logging"


//const execAsync = promisify(exec)
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

/**
 * Check if Visual C++ Redistributable libraries are installed on Windows
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkVisualCppRedistributable(): Promise<boolean> {
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        // Check registry for Visual C++ Redistributable installations
        // VS Code is x64 only, so we only need to check x64 runtime
        const registryPaths = [
            "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X46",
            "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X46"
        ]        

        for (const path of registryPaths) {
            try {
                //const { stdout } = await execAsync(`reg query "${path}" /v Installed`, { timeout: 5000 })
                const { stdout } = await execFileAsync(
                    "reg",
                    ["query", path, "/v", "Installed"],
                    { timeout: 3000 }
                )
                if (stdout.includes("0x1")) {
                    return true
                }
            } catch {
                // Continue checking other paths
            }
        }

        return false
    } catch (error) {
        Log.error(`Error checking Visual C++ Redistributable: ${String(error)}`, {
            ...LOGLOC,
            func: "checkVisualCppRedistributable()",
        })
        return false
    }
}

/**
 * Check if Bonjour service is installed on Windows
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkBonjourService(): Promise<boolean> {
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        // Check if Bonjour service exists
        try {
            //const { stdout } = await execAsync('sc query "Bonjour Service"', { timeout: 5000 })
            const { stdout } = await execFileAsync(
                "sc",
                ["query", "Bonjour Service"],
                { timeout: 3000 }
            )
            if (stdout.includes("STATE") || stdout.includes("RUNNING") || stdout.includes("STOPPED")) {
                return true
            }
        } catch {
            // Service not found, continue to registry check
        }

        // Check registry for Bonjour installation
        const registryPaths = [
            "HKLM\\SOFTWARE\\Apple Inc.\\Bonjour11",
            "HKLM\\SOFTWARE\\WOW6432Node\\Apple Inc.\\Bonjour"
        ]
        
        for (const path of registryPaths) {
            try {
                //await execAsync(`reg query "${path}"`, { timeout: 5000 })
                await execFileAsync(
                    "reg",
                    ["query", path],
                    { timeout: 3000 }
                )
                return true
            } catch {
                // Continue checking other paths
            }
        }

        return false
    } catch (error) {
        Log.error(`Error checking Bonjour service: ${String(error)}`, {
            ...LOGLOC,
            func: "checkBonjourService()",
        })
        return false
    }
}

/**
 * Check if VISA is installed on Windows
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkVisaInstallation(): Promise<boolean> {
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        let dllFound = false
        let registryFound = false

        //  1. REQUIRED: Check for VISA runtime DLLs

        const dllPaths = [
            "C:\\Windows\\System32\\visa64.dll",
            "C:\\Windows\\SysWOW64\\visa32.dll"
        ]

        for (const dllPath of dllPaths) {
            if (fs.existsSync(dllPath)) {
                dllFound = true
                break
            }
        }

        if (!dllFound) {
            // Without a VISA runtime DLL, VISA is not installed
            return false
        }
        
        //  2. OPTIONAL: Vendor registry keys         

        const registryPaths = [
            // NI-VISA
            "HKLM\\SOFTWARE\\National Instruments\\NI-VISA",
            "HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\NI-VISA",

            // Rohde & Schwarz VISA
            "HKLM\\SOFTWARE\\Rohde-Schwarz\\VISA",
            "HKLM\\SOFTWARE\\WOW6432Node\\Rohde-Schwarz\\VISA",

            // Keysight / Agilent VISA (optional, uncomment if needed)
            // "HKLM\\SOFTWARE\\Keysight\\IO Libraries Suite",
            // "HKLM\\SOFTWARE\\WOW6432Node\\Keysight\\IO Libraries Suite",
            // "HKLM\\SOFTWARE\\Agilent\\IO Libraries Suite",
            // "HKLM\\SOFTWARE\\WOW6432Node\\Agilent\\IO Libraries Suite"
        ]

        for (const regPath of registryPaths) {
            try {
                //await execAsync(`reg query "${regPath}"`, { timeout: 5000 })
                await execFileAsync(
                    "reg",
                    ["query", regPath],
                    { timeout: 3000 }
                )
                registryFound = true
                break
            } catch {
                // ignore and continue checking other paths
            }
        }

        if (!registryFound) {
            Log.warn(
                "VISA runtime DLL found but no vendor registry keys detected",
                {
                    ...LOGLOC,
                    func: "checkVisaInstallation()"
                }
            )
        }

        return true
    } catch (error) {
        Log.error(`Error checking VISA installation: ${String(error)}`, {
            ...LOGLOC,
            func: "checkVisaInstallation()",
        })
        return false
    }
}

/**
 * Check if VISA is installed on Linux
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkVisaInstallationLinux(): Promise<boolean> {
    if (!isLinux) {
        return true // skip for non-Linux platforms
    }

    try {
        // Run ldconfig directly (no shell)
        const { stdout } = await execFileAsync("ldconfig", ["-p"], { timeout: 5000 })

        // Check for any libvisa.so entry
        return stdout
            .toLowerCase()
            .includes("libvisa.so")
    } catch {
        return false
    }
}

interface MissingDependency {
    name: string
    description: string
    downloadUrl: string
    learnMoreUrl?: string
}

/**
 * Check if Avahi daemon is installed on Linux
 * @returns Promise<boolean> - true if installed, false otherwise
 */
export async function checkAvahiInstalled(): Promise<boolean> {
    if (!isLinux) {
        return true // skip for non-Linux platforms
    }

    try {
        const checks: Array<[string, string[]]> = [
            ["dpkg", ["-s", "avahi-daemon"]],   // Debian / Ubuntu
            ["rpm", ["-q", "avahi", "avahi-daemon"]],   // RHEL / Fedora
            ["pacman", ["-Q", "avahi"]],    // Arch
            ["apk", ["info", "avahi"]], // Alpine
            ["avahi-daemon", ["--version"]] // Direct command check
        ]

        for (const [cmd, args] of checks) {
            try {
                await execFileAsync(cmd, args, { timeout: 3000 })
                return true
            } catch {
                // try next
            }
        }
        
        return false
    } catch (error) {
        Log.error(`Error checking Avahi installation: ${String(error)}`, {
            ...LOGLOC,
            func: "checkAvahiInstalled()",
        })
        return false
    }
}

/**
 * Check if Avahi daemon is running on Linux
 */
export async function checkAvahiRunning(): Promise<boolean> {
    if (!isLinux) {
        return true
    }

    try {
        // systemd-based systems
        try {
            //const { stdout } = await execAsync('systemctl is-active avahi-daemon', { timeout: 3000 })
            const { stdout } = await execFileAsync(
                "systemctl",
                ["is-active", "avahi-daemon"],
                { timeout: 3000 }
            )
            if (stdout.trim() === "active") {
                return true
            }
        } catch {
            // fallback
        }
        // non-systemd fallback
        try {
            //await execAsync('pgrep avahi-daemon', { timeout: 3000 })
            await execFileAsync(
                "pgrep",
                ["avahi-daemon"],
                { timeout: 3000 }
            )
            return true
        } catch {
            return false
        }
    } catch (error) {
        Log.error(`Error checking Avahi running state: ${String(error)}`, {
            ...LOGLOC,
            func: "checkAvahiRunning()",
        })
        return false
    }
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
            return (major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR))
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
                const { stdout } = await execFileAsync(cmd, args, { timeout: 3000 })
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
async function showDependencyDetailsMenu(missing: MissingDependency[]): Promise<void> {
    while (true) {
        // Create QuickPick items for each dependency
        const items = missing.map(dep => ({
            label: `$(warning) ${dep.name}`,
            description: dep.description,
            detail: "Click to download or learn more",
            dep: dep
        }))

        // Add a "Done" option to exit the menu
        const doneItem = {
            label: "$(check) Done",
            description: "Close this menu",
            detail: "",
            dep: null as MissingDependency | null
        }

        const allItems = [...items, doneItem]

        const chosen = await vscode.window.showQuickPick(allItems, {
            placeHolder: `${missing.length} missing ${missing.length === 1 ? "dependency" : "dependencies"} - Select one to view options`,
            title: "Missing Dependencies",
            ignoreFocusOut: true
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
            ignoreFocusOut: true
        })

        if (action?.includes("Download")) {
            await vscode.env.openExternal(vscode.Uri.parse(chosen.dep.downloadUrl))
            // Show confirmation and continue
            await vscode.window.showInformationMessage(`Opening ${chosen.dep.name} download page in your browser...`)
            continue
        } else if (action?.includes("Learn More") && chosen.dep.learnMoreUrl) {
            await vscode.env.openExternal(vscode.Uri.parse(chosen.dep.learnMoreUrl))
            // Show confirmation and continue
            await vscode.window.showInformationMessage(`Opening ${chosen.dep.name} information page in your browser...`)
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
async function showMissingDependenciesNotification(missing: MissingDependency[]): Promise<void> {
    if (missing.length === 0) {
        return
    }

    while (true) {
        // Build the message
        let message = ""
        
        if (missing.length === 1) {
            message = `${missing[0].name} is required but not detected on your system.`
        } else {
            message = `${missing.length} required dependencies are missing:\n\n`
            message += missing.map(dep => `• ${dep.name}`).join("\n")
        }

        message += "\n\nSome features may not work correctly without these dependencies."

        // Create action buttons based on number of dependencies
        const actions: string[] = []
        const actionMap = new Map<string, MissingDependency>()

        // Only show individual download buttons for single dependency
        if (missing.length === 1) {
            missing.forEach(dependency => {
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

        const selection = await vscode.window.showWarningMessage(message, ...actions)

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
                await vscode.window.showInformationMessage(`Opening ${dep.name} download page in your browser...`)
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
                learnMoreUrl: "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist"
            })
        } else {
            Log.debug("Visual C++ Redistributable detected", logloc)
        }

        // Check Bonjour service
        const hasBonjour = await checkBonjourService()
        if (!hasBonjour) {
            Log.warn("Bonjour service not detected", logloc)
            missingDependencies.push({
                name: "Bonjour",
                description: "Required for mDNS device discovery",
                downloadUrl: "https://support.apple.com/kb/DL999",
                learnMoreUrl: "https://developer.apple.com/bonjour/"
            })
        } else {
            Log.debug("Bonjour service detected", logloc)
        }

        // Check VISA installation
        const hasVisa = await checkVisaInstallation()
        if (!hasVisa) {
            Log.warn("VISA installation not detected", logloc)
            missingDependencies.push({
                name: "VISA",
                description: "Required for instrument communication via VISA protocol",
                downloadUrl: "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
                learnMoreUrl: "https://www.ivifoundation.org/specifications/default.aspx"
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
        
        // Check if Avahi daemon is installed
        const avahiInstalled = await checkAvahiInstalled()
        if (!avahiInstalled) {
            Log.warn("Avahi daemon not installed", logloc)
            missingDependencies.push({
                name: "Avahi",
                description: "Required for mDNS device discovery on Linux",
                downloadUrl: "https://avahi.org/download/",
                learnMoreUrl: "https://avahi.org/"
            })
        } else {
            Log.debug("Avahi daemon installed", logloc)
            
            // Check if Avahi daemon is running
            const avahiRunning = await checkAvahiRunning()
            if (!avahiRunning) {
                Log.warn("Avahi daemon is not running", logloc)
                missingDependencies.push({
                    name: "Avahi Service",
                    description: "Avahi is installed but not running. Please start the avahi-daemon service.",
                    downloadUrl: "https://avahi.org/faq/",
                    learnMoreUrl: "https://avahi.org/wiki/RunningAvahi"
                })
            } else {
                Log.debug("Avahi daemon is running", logloc)
            }
        }

        // Check GLIBC version
        const hasGlibc239 = await checkGlibcVersion()
        if (!hasGlibc239) {
            Log.warn("GLIBC version is less than 2.39", logloc)
            missingDependencies.push({
                name: "GLIBC >= 2.39",
                description: "Required for compatibility with modern features. Your system has an older version.",
                downloadUrl: "https://www.gnu.org/software/libc/",
                learnMoreUrl: "https://www.gnu.org/software/libc/libc.html"
            })
        } else {
            Log.debug("GLIBC version is 2.39 or higher", logloc)
        }

        // Check VISA installation
        const hasVisaLinux = await checkVisaInstallationLinux()
        if (!hasVisaLinux) {
            Log.warn("VISA installation not detected on Linux", logloc)
            missingDependencies.push({
                name: "VISA",
                description: "Required for instrument communication via VISA protocol",
                downloadUrl: "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
                learnMoreUrl: "https://www.ivifoundation.org/specifications/default.aspx"
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
