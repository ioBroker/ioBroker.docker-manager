import type { DockerContainerInspect } from '@iobroker/plugin-docker';

export type GUIRequestInfo = {
    type: 'info';
};

export type GUIRequestImages = {
    type: 'images';
};
export type GUIRequestContainers = {
    type: 'containers';
};
export type GUIRequestNetworks = {
    type: 'networks';
};
export type GUIRequestContainer = {
    type: 'containers';
    container: string;
};
export type GUIRequestVolumes = {
    type: 'volumes';
};

export type GUIRequest =
    | GUIRequestInfo
    | GUIRequestImages
    | GUIRequestContainers
    | GUIRequestContainer
    | GUIRequestVolumes
    | GUIRequestNetworks;

export type GUIResponseInfo = {
    command: 'info';
    data?: DiskUsage;
    version?: string;
    error?: string;
};
export type GUIResponseContainers = {
    command: 'containers';
    data?: ContainerInfo[];
    error?: string;
};
export type GUIResponseImages = {
    command: 'images';
    data?: ImageInfo[];
    error?: string;
};
export type GUIResponseContainer = {
    command: 'container';
    data?: DockerContainerInspect | null;
    container: string;
    error?: string;
};
export type GUIResponseExec = {
    command: 'exec';
    data: { containerId: string; code?: number | null; stderr: string; stdout: string };
    error?: string;
};
export type GUIResponseNetworks = {
    command: 'networks';
    data?: NetworkInfo[];
    error?: string;
};
export type GUIResponseVolumes = {
    command: 'volumes';
    data?: VolumeInfo[];
    error?: string;
};
export type GUIResponseTerminal = {
    command: 'terminal';
    containerId: string;
    /** Raw output chunk of the interactive shell (already UTF-8 decoded) */
    data?: string;
    /** Set to true when the shell process has ended */
    exit?: boolean;
    error?: string;
};

export type GUIResponse =
    | GUIResponseInfo
    | GUIResponseContainers
    | GUIResponseImages
    | GUIResponseContainer
    | GUIResponseExec
    | GUIResponseNetworks
    | GUIResponseVolumes
    | GUIResponseTerminal
    | { command: 'stopped' };

/** Control message sent from the GUI to drive an interactive container terminal */
export type TerminalRequest =
    | { action: 'create'; containerId: string; shell?: string }
    | { action: 'data'; containerId: string; data: string }
    | { action: 'resize'; containerId: string; cols: number; rows: number }
    | { action: 'close'; containerId: string };

export interface DockerManagerAdapterConfig extends ioBroker.AdapterConfig {
    dockerApi: boolean;
    host?: string;
    port?: number | string;
    protocol?: 'http' | 'https';
    ca?: string;
    cert?: string;
    key?: string;
}
