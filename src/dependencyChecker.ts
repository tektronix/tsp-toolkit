import { inspect, promisify } from "util"
import { platform } from "node:os"
import { execFile } from "child_process"
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
    } catch (error) {
        if (
            !(
                error instanceof Error &&
                "killed" in error &&
                "signal" in error &&
                error.killed === true &&
                error.signal === "SIGTERM"
            )
        ) {
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
    return true
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
    } catch (error) {
        if (
            !(
                error instanceof Error &&
                "killed" in error &&
                "signal" in error &&
                error.killed === true &&
                error.signal === "SIGTERM"
            )
        ) {
            Log.error(`Error checking VISA installation: ${inspect(error)}`, {
                ...LOGLOC,
                func: "checkVisaInstallation()",
            })
            return false
        }
    }
    return true
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

export interface MissingDependency {
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

export interface DependencyCheckResult {
    /** true if every dependency (required and optional) is present */
    ok: boolean
    /** dependencies that are missing and should be reported to the user */
    missing: MissingDependency[]
}

/**
 * Check all dependencies for the current platform without any UI.
 * @param ignoreMissingVisa - don't report VISA as missing (the result still reflects it)
 */
export async function findMissingDependencies(
    ignoreMissingVisa = false,
): Promise<DependencyCheckResult> {
    const logloc = { ...LOGLOC, func: "findMissingDependencies()" }
    const missing: MissingDependency[] = []

    const visaDependency: MissingDependency = {
        name: "VISA(Optional)",
        description:
            "Optional - Required only for VISA protocol instrument communication",
        downloadUrl:
            "https://www.ni.com/en-us/support/downloads/drivers/download.ni-visa.html",
        learnMoreUrl:
            "https://www.ivifoundation.org/specifications/default.aspx",
        optional: true,
    }

    if (isWindows) {
        Log.debug("Checking Windows dependencies", logloc)

        const hasVCRedist = await checkVisualCppRedistributable()
        if (!hasVCRedist) {
            Log.warn("Visual C++ Redistributable not detected", logloc)
            missing.push({
                name: "Visual C++ Redistributable",
                description: "Required for native modules and performance",
                downloadUrl: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
                learnMoreUrl:
                    "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist",
            })
        } else {
            Log.debug("Visual C++ Redistributable detected", logloc)
        }

        const hasVisa = await checkVisaInstallation(STARTUP_PROBE_TIMEOUT_MS)
        if (!hasVisa && !ignoreMissingVisa) {
            Log.debug(
                "VISA not installed (optional - required only for VISA protocol support)",
                logloc,
            )
            missing.push(visaDependency)
        } else {
            Log.debug("VISA installation detected", logloc)
        }

        return { ok: hasVisa && hasVCRedist, missing }
    } else if (isMacOS) {
        Log.debug("Checking macOS dependencies", logloc)
        return { ok: true, missing }
    } else if (isLinux) {
        Log.debug("Checking Linux dependencies", logloc)

        const hasGlibc = await checkGlibcVersion()
        if (!hasGlibc) {
            Log.warn("GLIBC version is less than 2.39", logloc)
            missing.push({
                name: "GLIBC >= 2.39",
                description:
                    "Required for compatibility with modern features. Your system has an older version.",
                downloadUrl: "https://www.gnu.org/software/libc/",
                learnMoreUrl: "https://www.gnu.org/software/libc/libc.html",
            })
        } else {
            Log.debug("GLIBC version is 2.39 or higher", logloc)
        }

        const hasVisaLinux = await checkVisaInstallationLinux(
            STARTUP_PROBE_TIMEOUT_MS,
        )
        if (!hasVisaLinux && !ignoreMissingVisa) {
            Log.debug(
                "VISA not installed (optional - required only for VISA protocol support)",
                logloc,
            )
            missing.push(visaDependency)
        } else {
            Log.debug("VISA installation detected on Linux", logloc)
        }

        return { ok: hasVisaLinux && hasGlibc, missing }
    }
    return { ok: false, missing }
}
