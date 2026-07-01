import { GenericSessionDataProvider } from "./genericSessionDataProvider"
import { GenericSessionStorage } from "./genericSessionStorage"

/**
 * Data provider for Trigger Flow sessions
 * Extends GenericSessionDataProvider with specific configuration for Trigger Flow
 */
export class TriggerFlowDataProvider extends GenericSessionDataProvider {
    constructor(storage: GenericSessionStorage) {
        super(
            storage,
            "TriggerFlow",
            "SavedTriggerFlowTreeItem",
            "SavedTriggerFlowInstance",
            "ActiveSavedTriggerFlowInstance",
            "tsp.viewTriggerFlowUI",
        )
    }
}
