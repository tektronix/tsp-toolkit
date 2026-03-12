import { GenericSessionDataProvider } from "./genericSessionDataProvider"
import { GenericSessionStorage } from "./genericSessionStorage"

/**
 * Data provider for Script Generation (I-V Characterization) sessions
 * Extends GenericSessionDataProvider with specific configuration for Script Gen
 */
export class ScriptGenDataProvider extends GenericSessionDataProvider {
    constructor(storage: GenericSessionStorage) {
        super(
            storage,
            "I-V Characterization Script Generation", // This will be the name shown in the tree view
            "SavedIVCharTreeItem",
            "SavedIVCharInstance",
            "ActiveSavedIVCharInstance",
            "tsp.viewScriptGenUI",
        )
    }
}
