import * as vscode from "vscode"
import { findMissingDependencies, MissingDependency } from "./dependencyChecker"

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
export async function checkSystemDependencies(): Promise<boolean> {
    const ignoreMissingVisa = vscode.workspace
        .getConfiguration("tsp")
        .get<boolean>("ignoreMissingVisa", false)
    const { ok, missing } = await findMissingDependencies(ignoreMissingVisa)
    if (missing.length > 0) {
        await showMissingDependenciesNotification(missing)
    }
    return ok
}
