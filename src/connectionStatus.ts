// This module must not import `vscode` so that it can be used by unit tests that
// run outside of the extension host.

/**
 * The possible statuses of a connection interface/protocol
 */
export enum ConnectionStatus {
    /**
     * This instrument is ignored. This variant should not be used for interfaces
     */
    Ignored,
    /**
     * This connection interface was deemed inactive and will not respond to connection attempts
     */
    Inactive,
    /**
     * This connection interface was deemed active and will respond to connection attempts
     */
    Active,
    /**
     * This connection interface is in the process of connecting to the instrument
     */
    Connecting,
    /**
     * This connection interface was deemed connected and already has a terminal associated with it
     */
    Connected,
}
