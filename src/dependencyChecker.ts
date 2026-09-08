import { promisify } from "util"
import { platform, arch, release, cpus } from "node:os"
import fs from "node:fs"
import { execFile } from "child_process"
import * as vscode from "vscode"
import { Log, SourceLocation } from "./logging"

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
    const logloc = { ...LOGLOC, func: "checkVisualCppRedistributable()" }
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    // Log environment details relevant to why detection may differ across machines
    Log.debug(
        `System info for VC++ redist check: process.arch=${process.arch}, os.arch=${arch()}, os.release=${release()}`,
        logloc,
    )

    try {
        // Check registry for Visual C++ Redistributable installations
        // VS Code is x64 only, so we only need to check x64 runtime
        const registryPaths = [
            "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64",
        ]

        for (const path of registryPaths) {
            try {
                const { stdout } = await execFileAsync(
                    "reg",
                    ["query", path, "/v", "Installed"],
                    { timeout: 3000 },
                )
                Log.debug(
                    `Registry query result for "${path}": ${stdout.trim().replace(/\r?\n/g, " | ")}`,
                    logloc,
                )
                if (stdout.includes("0x1")) {
                    Log.debug(
                        `Visual C++ Redistributable detected via registry path "${path}"`,
                        logloc,
                    )
                    return true
                }
            } catch (err) {
                // Continue checking other paths
                Log.debug(
                    `Registry query failed for "${path}": ${String(err)}`,
                    logloc,
                )
            }
        }

        Log.warn(
            `Visual C++ Redistributable not detected in any checked registry path: ${registryPaths.join(", ")}`,
            logloc,
        )
        return false
    } catch (error) {
        Log.error(
            `Error checking Visual C++ Redistributable: ${String(error)}`,
            logloc,
        )
        return false
    }
}

/**
 * Check if VISA is installed on Windows
 * VISA detection follows a three-step process:
 * 1. Check for VISA runtime DLL (C:\Windows\System32\visa64.dll) - REQUIRED
 * 2. Check for IVI Shared VISA mode (multi-vendor framework)
 * 3. Fallback to single-vendor VISA detection (NI, Keysight, R&S)
 *
 * @returns Promise<boolean> - true if VISA is properly installed, false otherwise
 * @note VISA is optional. Users can use LAN instruments without it.
 * @note Only x64 DLL is checked since VS Code is x64-only
 */
export async function checkVisaInstallation(): Promise<boolean> {
    const logloc = { ...LOGLOC, func: "checkVisaInstallation()" }
    if (!isWindows) {
        return true // skip for non-Windows platforms
    }

    try {
        // -------------------------------------------------
        // 1. REQUIRED: VISA loader DLL must exist
        // -------------------------------------------------
        const visaDllPath = "C:\\Windows\\System32\\visa64.dll"

        if (!fs.existsSync(visaDllPath)) {
            Log.debug(
                `VISA not installed: visa64.dll not found at expected path "${visaDllPath}"`,
                logloc,
            )
            return false
        }

        Log.debug(`VISA DLL found at "${visaDllPath}"`, logloc)

        // -------------------------------------------------
        // 2. Check for IVI Shared VISA (multi-vendor mode)
        // -------------------------------------------------
        const iviVisaKey = "HKLM\\SOFTWARE\\IVI\\VISA"

        const iviKeyExists = await registryKeyExists(iviVisaKey)
        Log.debug(
            `IVI VISA registry key "${iviVisaKey}" exists: ${iviKeyExists}`,
            logloc,
        )
        if (iviKeyExists) {
            const hasVendor = await hasEnabledIviVisaVendor(iviVisaKey)
            if (hasVendor) {
                Log.debug(
                    "VISA installed in shared mode (IVI VISA with enabled vendor)",
                    logloc,
                )
                return true
            }
        }

        // -------------------------------------------------
        // 3. Fallback: single-vendor VISA detection
        // -------------------------------------------------
        const hasSingleVendor = await hasSingleVendorVisa()
        if (hasSingleVendor) {
            Log.debug("VISA installed in single-vendor mode", logloc)
            return true
        }

        Log.warn(
            `VISA DLL found at "${visaDllPath}" but no vendor configuration detected (IVI key exists: ${iviKeyExists}, no enabled IVI vendor or single-vendor install found)`,
            logloc,
        )
        return false
    } catch (error) {
        Log.error(`Error checking VISA installation: ${String(error)}`, logloc)
        return false
    }
}

/**
 * Utility: Check if a registry key exists on Windows
 * @param key - Registry path (e.g., "HKLM\\SOFTWARE\\Path\\To\\Key")
 * @returns Promise<boolean> - true if registry key exists, false otherwise
 * @note Uses 'reg query' command with 3-second timeout
 */
async function registryKeyExists(key: string): Promise<boolean> {
    try {
        await execFileAsync("reg", ["query", key], { timeout: 3000 })
        return true
    } catch (err) {
        Log.debug(`Registry key "${key}" not found: ${String(err)}`, {
            ...LOGLOC,
            func: "registryKeyExists()",
        })
        return false
    }
}

/**
 * Check if IVI Shared VISA mode is available with at least one enabled vendor
 * IVI VISA is a framework that allows multiple vendors (NI, Keysight, R&S) to share
 * a common VISA implementation. Each vendor can be enabled/disabled individually.
 *
 * Detection logic:
 * 1. Query IVI VISA registry key to list all registered vendors
 * 2. For each vendor, check if it's enabled (Enabled=0x1)
 * 3. Verify the vendor's DLL path exists on the system
 * 4. Return true if at least one enabled vendor with valid DLL is found
 *
 * @param iviVisaKey - IVI VISA registry path (typically HKLM\SOFTWARE\IVI\VISA)
 * @returns Promise<boolean> - true if enabled vendor found with valid DLL, false otherwise
 */
async function hasEnabledIviVisaVendor(iviVisaKey: string): Promise<boolean> {
    const logloc = { ...LOGLOC, func: "hasEnabledIviVisaVendor()" }
    try {
        const { stdout } = await execFileAsync("reg", ["query", iviVisaKey], {
            timeout: 3000,
        })

        const vendorKeys = stdout
            .split(/\r?\n/)
            .filter((line) => line.startsWith("HKEY"))
        Log.debug(
            `IVI VISA vendor keys found under "${iviVisaKey}": ${vendorKeys.length ? vendorKeys.join(", ") : "(none)"}`,
            logloc,
        )

        for (const vendorKey of vendorKeys) {
            const enabled = await isVendorEnabled(vendorKey)
            if (!enabled) {
                Log.debug(`Vendor "${vendorKey}" is not enabled`, logloc)
                continue
            }

            const vendorPath = await getVendorPath(vendorKey)
            const pathExists = !!vendorPath && fs.existsSync(vendorPath)
            Log.debug(
                `Vendor "${vendorKey}" enabled=${enabled}, path="${vendorPath}", pathExists=${pathExists}`,
                logloc,
            )
            if (pathExists) {
                return true
            }
        }
    } catch (err) {
        Log.debug(
            `Failed to query IVI VISA key "${iviVisaKey}": ${String(err)}`,
            logloc,
        )
    }

    return false
}

/**
 * Check if a specific VISA vendor is enabled in IVI Shared VISA mode
 * Enabled vendors have Enabled=0x1 (REG_DWORD) in their registry key
 *
 * @param vendorKey - Registry path to vendor key (e.g., "HKLM\\SOFTWARE\\IVI\\VISA\\NI")
 * @returns Promise<boolean> - true if vendor is enabled, false otherwise
 */
async function isVendorEnabled(vendorKey: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(
            "reg",
            ["query", vendorKey, "/v", "Enabled"],
            { timeout: 3000 },
        )
        return stdout.includes("REG_DWORD") && stdout.includes("0x1")
    } catch (err) {
        Log.debug(
            `"Enabled" value not found for vendor key "${vendorKey}": ${String(err)}`,
            { ...LOGLOC, func: "isVendorEnabled()" },
        )
        return false
    }
}

/**
 * Get the installation path of a VISA vendor from its registry key
 * Vendors store their DLL path in a "Path" registry value (REG_SZ)
 * This is used to verify that the vendor's DLL actually exists on disk
 *
 * @param vendorKey - Registry path to vendor key
 * @returns Promise<string | null> - Vendor DLL path if found, null otherwise
 */
async function getVendorPath(vendorKey: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync(
            "reg",
            ["query", vendorKey, "/v", "Path"],
            { timeout: 3000 },
        )

        const match = stdout.match(/Path\s+REG_SZ\s+(.*)/i)
        return match ? match[1].trim() : null
    } catch (err) {
        Log.debug(
            `"Path" value not found for vendor key "${vendorKey}": ${String(err)}`,
            { ...LOGLOC, func: "getVendorPath()" },
        )
        return null
    }
}
/**
 * Check if single-vendor VISA is installed
 * Single-vendor mode means VISA is installed by one vendor independently,
 * without using the IVI Shared VISA framework.
 *
 * Supported single-vendor installations:
 * 1. National Instruments (NI-VISA) - Most common case
 *    - Registry: HKLM\SOFTWARE\National Instruments\NI-VISA
 *    - DLL: C:\Program Files\National Instruments\VISA\nivisa.dll
 *
 * 2. Keysight / Agilent (IO Libraries Suite)
 *    - Registry: HKLM\SOFTWARE\Keysight\IO Libraries Suite or Agilent variant
 *
 * 3. Rohde & Schwarz (VISA)
 *    - Registry: HKLM\SOFTWARE\Rohde-Schwarz\VISA
 *
 * Note: NI-VISA DLL is explicitly checked because NI is the most common
 * single-vendor installation that doesn't always register in IVI registry.
 *
 * @returns Promise<boolean> - true if any single-vendor VISA found, false otherwise
 */
async function hasSingleVendorVisa(): Promise<boolean> {
    const logloc = { ...LOGLOC, func: "hasSingleVendorVisa()" }

    // --- NI-VISA ---
    // The most common single-vendor case
    // The only vendor that frequently installs without IVI Shared VISA
    // So NI DLL is explicitly checked in addition to registry
    const niRegistryFound = await registryKeyExists(
        "HKLM\\SOFTWARE\\National Instruments\\NI-VISA",
    )
    const niDllPath =
        "C:\\Program Files\\National Instruments\\VISA\\nivisa.dll"
    const niDllFound = fs.existsSync(niDllPath)
    Log.debug(
        `NI-VISA check: registryFound=${niRegistryFound}, dllPath="${niDllPath}", dllFound=${niDllFound}`,
        logloc,
    )
    if (niRegistryFound || niDllFound) {
        return true
    }

    // --- Keysight / Agilent ---
    const keysightFound = await registryKeyExists(
        "HKLM\\SOFTWARE\\Keysight\\IO Libraries Suite",
    )
    const agilentFound = await registryKeyExists(
        "HKLM\\SOFTWARE\\Agilent\\IO Libraries Suite",
    )
    Log.debug(
        `Keysight/Agilent check: keysightFound=${keysightFound}, agilentFound=${agilentFound}`,
        logloc,
    )
    if (keysightFound || agilentFound) {
        return true
    }

    // --- Rohde & Schwarz ---
    // Unlike NI or Keysight, R&S does not consistently create a top-level …\VISA key.
    // R&S VISA is installed system-wide, but its main vendor key is not under HKLM\SOFTWARE\Rohde-Schwarz\VISA on many systems.
    // HKCU\Software\Rohde-Schwarz\RsVisa may exist for user-specific settings, but not for system-wide detection.
    const rsVisaFound = await registryKeyExists(
        "HKLM\\SOFTWARE\\Rohde-Schwarz\\VISA",
    )
    const rsRsVisaFound = await registryKeyExists(
        "HKLM\\SOFTWARE\\Rohde-Schwarz\\RsVisa",
    )
    Log.debug(
        `Rohde-Schwarz check: rsVisaFound=${rsVisaFound}, rsRsVisaFound=${rsRsVisaFound}`,
        logloc,
    )
    if (rsVisaFound || rsRsVisaFound) {
        return true
    }

    Log.debug("No single-vendor VISA installation detected", logloc)
    return false
}

/**
 * Check if VISA is installed on Linux
 * VISA detection uses a two-step approach:
 * 1. Preferred: Query ldconfig (system linker cache) for VISA libraries - fast and reliable
 * 2. Fallback: Manually scan standard system and vendor library directories
 *
 * Supports both shared VISA installations (system paths) and vendor-specific installs (/opt prefix)
 *
 * @returns Promise<boolean> - true if VISA library found, false otherwise
 * @note VISA is optional. Users can use LAN instruments without it.
 */
export async function checkVisaInstallationLinux(): Promise<boolean> {
    if (!isLinux) {
        return true // skip for non-Linux platforms
    }

    // Define regex patterns to match VISA library files:
    // Pattern 1: Standard libvisa.so (possibly with version suffixes like libvisa.so.7)
    // Pattern 2: Variant VISA libraries (e.g., libniVisa, libAgVisa.so, libRsVisa.so, case-insensitive)
    const visaLibPatterns = [
        /^libvisa\.so(\.\d+)*$/,
        /^lib.*visa.*\.so(\.\d+)*$/i,
    ]

    // -------------------------------------------------
    // 1. Preferred: ldconfig (system linker cache)
    // -------------------------------------------------
    try {
        const { stdout } = await execFileAsync("ldconfig", ["-p"], {
            timeout: 5000,
        })

        const lines = stdout.split(/\r?\n/)
        for (const line of lines) {
            const libName = line.split(/\s+/)[0]
            if (!libName) continue

            for (const pattern of visaLibPatterns) {
                if (pattern.test(libName)) {
                    return true
                }
            }
        }
    } catch {
        // ldconfig unavailable → fallback to directory scan
        Log.debug("ldconfig unavailable, falling back to directory scan", {
            ...LOGLOC,
            func: "checkVisaInstallationLinux()",
        })
    }

    // -------------------------------------------------
    // 2. Fallback: standard system library paths
    // -------------------------------------------------
    const systemLibDirs = [
        "/lib",
        "/lib64",
        "/usr/lib",
        "/usr/lib64",
        "/usr/local/lib",
        "/usr/local/lib64",
    ]

    // -------------------------------------------------
    // 3. Fallback: known vendor install prefixes
    // -------------------------------------------------
    const vendorLibDirs = [
        "/opt/ni-visa/lib",
        "/opt/national-instruments/visa/lib",
        "/opt/keysight/iolibs/lib",
        "/opt/rohde-schwarz/lib",
        "/usr/share/ni-visa/lib",
    ]

    const allDirs = [...systemLibDirs, ...vendorLibDirs]

    for (const dir of allDirs) {
        try {
            if (!fs.existsSync(dir)) continue

            const files = fs.readdirSync(dir)
            for (const file of files) {
                for (const pattern of visaLibPatterns) {
                    if (pattern.test(file)) {
                        return true
                    }
                }
            }
        } catch {
            // Ignore permission errors and continue
        }
    }

    // -------------------------------------------------
    // 4. Fallback: check LD_LIBRARY_PATH directories
    // -------------------------------------------------
    // Users may have custom VISA installations in directories specified via LD_LIBRARY_PATH
    const ldLibraryPath = process.env.LD_LIBRARY_PATH
    if (ldLibraryPath) {
        const customDirs = ldLibraryPath.split(":")
        for (const dir of customDirs) {
            try {
                if (!dir || !fs.existsSync(dir)) continue

                const files = fs.readdirSync(dir)
                for (const file of files) {
                    for (const pattern of visaLibPatterns) {
                        if (pattern.test(file)) {
                            return true
                        }
                    }
                }
            } catch {
                // Ignore permission errors and continue
            }
        }
    }

    return false
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

    // Log processor and OS details up front to aid in debugging detection issues
    const cpuModel = cpus()[0]?.model ?? "unknown"
    Log.debug(
        `System diagnostics: platform=${platform()}, processArch=${process.arch}, osArch=${arch()}, osRelease=${release()}, cpuModel="${cpuModel}", cpuCount=${cpus().length}`,
        logloc,
    )

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
        const hasVisa = await checkVisaInstallation()
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
        const hasVisaLinux = await checkVisaInstallationLinux()
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
