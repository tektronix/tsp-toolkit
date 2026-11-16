const pythonKeywords = new Set([
    "false",
    "none",
    "true",
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
])

export function toPythonClassName(baseName: string): string {
    const className = baseName
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map((word) =>
            word
                .replace(/[^A-Za-z0-9]+/g, "_")
                .replace(
                    /[A-Za-z0-9]+/g,
                    (part) => part.charAt(0).toUpperCase() + part.slice(1),
                ),
        )
        .join("")

    if (!/[A-Za-z0-9]/.test(className)) {
        return "TspWrapper"
    }

    let validClassName = /^[0-9]/.test(className) ? `_${className}` : className
    if (pythonKeywords.has(validClassName.toLowerCase())) {
        validClassName = `_${validClassName}`
    }
    return validClassName
}
