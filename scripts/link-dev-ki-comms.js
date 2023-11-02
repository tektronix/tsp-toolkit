#!/usr/bin/env node

const { env, exit } = require("process")
const { execSync } = require("child_process")
const fs = require("fs")

const LOCAL_DEV_DEPS = ["@trebuchet/ki-comms"]

function is_project_linked(project_name) {
    let link_data = {}
    try {
        const npm_output = execSync(
            `npm list --global --json --link ${project_name}`
        )
        link_data = JSON.parse(npm_output.toString())
    } catch (_) {
        // Output from npm list command also returned errors, so it probably didn't exist.
        return false
    }

    const recursive_check = (obj) => {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === "object") {
                if (key === project_name) {
                    return true
                }
                return recursive_check(value)
            }
        }
        return false
    }
    return recursive_check(link_data)
}

if (!env.hasOwnProperty("CI")) {
    for (const dep of LOCAL_DEV_DEPS) {
        //If the version is a file, then we know the link was already performed.
        if (!is_project_linked(dep)) {
            //prompt user for ki-comms location
            const readline = require("readline")
            const path = require("path")

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            })

            rl.question(
                `What is the absolute or relative path to your ${dep} folder\n(leave blank to install from registry)\n > `,
                (comms_path) => {
                    rl.close()
                    if (comms_path.trim().length == 0) {
                        return
                    }
                    const norm_path = path.normalize(comms_path)
                    try {
                        execSync(
                            `npm link --force --package-lock false ${norm_path}`
                        )
                    } catch (e) {
                        console.error(
                            `Unable to link path ${comms_path} (resolved to ${norm_path}).\n${e}`
                        )
                        process.exit(1)
                    }
                    console.log(`Linked directory ${norm_path} successfully.`)
                }
            )
        }
    }
}
