export function isVersionUpgrade(
    previousVersion: string,
    currentVersion: string,
): boolean {
    const previousParts = previousVersion.split(".").map(Number)
    const currentParts = currentVersion.split(".").map(Number)

    for (
        let index = 0;
        index < Math.max(previousParts.length, currentParts.length);
        index++
    ) {
        const previousPart = previousParts[index] ?? 0
        const currentPart = currentParts[index] ?? 0

        if (currentPart !== previousPart) {
            return currentPart > previousPart
        }
    }

    return false
}
