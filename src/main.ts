import { type AdapterOptions, Adapter } from '@iobroker/adapter-core';
import type { DockerImageTagsResponse } from '@iobroker/plugin-docker';
import type { DockerManagerAdapterConfig, GUIResponse, TerminalRequest } from './types';

import DockerMonitor from './lib/DockerMonitor';
import axios from 'axios';

export class DockerManagerAdapter extends Adapter {
    declare config: DockerManagerAdapterConfig;
    #dockerMonitor: DockerMonitor | undefined;

    #_guiSubscribes:
        | {
              clientId: string;
              ts: number;
              type: 'info' | 'images' | 'containers' | 'container' | 'networks' | 'volumes';
              container?: string;
              ownIp: string;
          }[]
        | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'docker-manager',
            uiClientSubscribe: data => this.onClientSubscribe(data.clientId, data.message),
            uiClientUnsubscribe: data => {
                const { clientId, reason } = data;
                if (reason === 'client') {
                    this.log.debug(`GUI Client "${clientId} disconnected`);
                } else {
                    this.log.debug(`Client "${clientId}: ${reason}`);
                }
                this.onClientUnsubscribe(clientId);
            },
        });
        this.on('ready', () => this.#onReady());
        this.on('unload', callback => this.#onUnload(callback));
        this.on('message', this.#onMessage.bind(this));
    }

    async scanRequests(): Promise<void> {
        const scans: {
            images: number;
            containers: string[];
            info: number;
            networks: number;
            container: string[];
            volumes: number;
        } = {
            images: 0,
            containers: [],
            info: 0,
            networks: 0,
            volumes: 0,
            container: [],
        };

        this.#_guiSubscribes?.forEach(it => {
            if (it.type === 'images') {
                scans.images++;
            } else if (it.type === 'containers') {
                if (!scans.containers.includes(it.ownIp)) {
                    scans.containers.push(it.ownIp);
                }
            } else if (it.type === 'networks') {
                scans.networks++;
            } else if (it.type === 'container') {
                scans.container.push(it.container!);
            } else if (it.type === 'volumes') {
                scans.volumes++;
            } else if (it.type === 'info') {
                scans.info++;
            }
        });

        await this.#dockerMonitor?.pollingUpdate(scans);
    }

    onClientSubscribe(
        clientId: string,
        message: ioBroker.Message,
    ): { error?: string; accepted: boolean; heartbeat?: number } {
        this.log.debug(`Subscribe from ${clientId}: ${JSON.stringify(message)}`);
        if (!this.#_guiSubscribes) {
            return { error: `Adapter is still initializing`, accepted: false };
        }
        const msg: {
            type: 'info' | 'images' | 'containers' | 'container' | 'networks';
            data?: {
                containerId?: string;
                ownIp: string;
                command?: string;
                terminate?: boolean;
                terminal?: TerminalRequest;
            };
        } = message.message;

        if (!msg.data) {
            return { error: `Invalid message: no data`, accepted: false };
        }
        if (!msg.data.ownIp) {
            return { error: `Invalid message: no own IP`, accepted: false };
        }

        // Interactive container terminal control messages. These are bound to the GUI client (clientId)
        // so the output can be pushed back to exactly this subscriber. They intentionally do not carry a
        // top-level containerId, so they neither disturb the container-list polling nor the one-shot exec.
        if (msg.data.terminal) {
            const t = msg.data.terminal;
            if (t.action === 'create') {
                void this.#dockerMonitor
                    ?.terminalCreate(clientId, t.containerId, t.shell)
                    .catch(e => this.log.warn(`Cannot create terminal: ${e}`));
            } else if (t.action === 'data') {
                this.#dockerMonitor?.terminalWrite(clientId, t.data);
            } else if (t.action === 'resize') {
                this.#dockerMonitor?.terminalResize(clientId, t.cols, t.rows);
            } else if (t.action === 'close') {
                this.#dockerMonitor?.terminalClose(clientId);
            }
            return { accepted: true };
        }
        // inform GUI that subscription is started
        const sub = this.#_guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this.#_guiSubscribes.push({
                clientId,
                ts: Date.now(),
                type: msg.type,
                container: msg.data.containerId,
                ownIp: msg.data.ownIp,
            });
            this.scanRequests().catch(e => this.log.warn(`Cannot scan: ${e}`));
        } else {
            sub.ts = Date.now();
            if (sub.type !== msg.type || sub.container !== msg.data?.containerId) {
                sub.type = msg.type;
                sub.container = msg.data?.containerId;
                this.scanRequests().catch(e => this.log.warn(`Cannot scan: ${e}`));
            }
        }

        if (msg.type === 'containers' && msg.data?.containerId) {
            if (msg.data.terminate) {
                // terminate execution
                void this.#dockerMonitor?.containerExecTerminate(msg.data.containerId, true);
            } else {
                // start execution
                void this.#dockerMonitor?.containerExec(msg.data.containerId, msg.data.command!, clientId);
            }
        }

        return { accepted: true };
    }

    onClientUnsubscribe(clientId: string): void {
        this.log.debug(`Unsubscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return;
        }
        // Close an interactive terminal that this client might have open
        this.#dockerMonitor?.terminalClose(clientId);
        let deleted;
        do {
            deleted = false;
            const pos = this.#_guiSubscribes.findIndex(s => s.clientId === clientId);
            void this.#dockerMonitor?.containerExecTerminate(clientId, false, true);
            if (pos !== -1) {
                deleted = true;
                this.#_guiSubscribes.splice(pos, 1);
            }
        } while (deleted);
        this.scanRequests().catch(e => this.log.warn(`Cannot scan: ${e}`));
    }

    sendToGui = async (data: GUIResponse, sid?: string): Promise<void> => {
        if (!this.#_guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            this.log.debug(`Send to GUI: ${JSON.stringify(data)}`);
            if (sid) {
                await this.sendToUI({ clientId: sid, data });
                return;
            }

            // send to all subscribers of this type
            for (let i = 0; i < this.#_guiSubscribes.length; i++) {
                if (
                    data.command === 'container' &&
                    data.command === this.#_guiSubscribes[i].type &&
                    data.container === this.#_guiSubscribes[i].container
                ) {
                    await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
                } else if (data.command === this.#_guiSubscribes[i].type && data.command !== 'container') {
                    await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
                }
            }
        }
    };

    async #onReady(): Promise<void> {
        this.#dockerMonitor = new DockerMonitor(this, this.config);
        await this.#dockerMonitor.isReady();
        this.#_guiSubscribes = [];
        await this.scanRequests();
    }

    async #onUnload(callback: () => void): Promise<void> {
        try {
            await this.#dockerMonitor?.destroy();
            this.#dockerMonitor = undefined;
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });
        } catch {
            // ignore
        }

        callback();
    }

    async #listImageTags(image: string): Promise<DockerImageTagsResponse['results']> {
        const response = await axios(`https://hub.docker.com/v2/repositories/${image}/tags/?page_size=100`);
        if (response.status !== 200) {
            throw new Error(`Cannot get tags for image ${image}: ${response.statusText}`);
        }
        return response.data.results;
    }

    async #onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj.command?.startsWith('dm:')) {
            // Handled by Device Manager class itself, so ignored here
            return;
        }
        this.log.debug(`Handle message ${obj.command} ${JSON.stringify(obj)}`);

        switch (obj.command) {
            case 'image:autocomplete': {
                const result = await this.#dockerMonitor?.imageNameAutocomplete(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:tags': {
                const result = await this.#listImageTags(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:pull': {
                const result = await this.#dockerMonitor?.imagePull(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:inspect': {
                const result = await this.#dockerMonitor?.imageInspect(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:remove': {
                const result = await this.#dockerMonitor?.imageRemove(obj.message.image);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:list': {
                const result = await this.#dockerMonitor?.imageList();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'image:prune': {
                const result = await this.#dockerMonitor?.imagePrune();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:run': {
                const result = await this.#dockerMonitor?.containerRun(obj.message);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:create': {
                const result = await this.#dockerMonitor?.containerCreate(obj.message);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:stop': {
                const result = await this.#dockerMonitor?.containerStop(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:inspect': {
                const result = await this.#dockerMonitor?.containerInspect(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:start': {
                const result = await this.#dockerMonitor?.containerStart(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:restart': {
                const result = await this.#dockerMonitor?.containerRestart(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:remove': {
                const result = await this.#dockerMonitor?.containerRemove(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:logs': {
                const result = await this.#dockerMonitor?.containerLogs(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:prune': {
                const result = await this.#dockerMonitor?.containerPrune();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'container:create-compose': {
                const result = await this.#dockerMonitor?.containerCreateCompose(obj.message.compose);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'network:create': {
                const result = await this.#dockerMonitor?.networkCreate(obj.message.name, obj.message.driver);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'network:remove': {
                const result = await this.#dockerMonitor?.networkRemove(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'network:prune': {
                const result = await this.#dockerMonitor?.networkPrune();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'volume:create': {
                const result = await this.#dockerMonitor?.volumeCreate(
                    obj.message.name,
                    obj.message.driver,
                    obj.message.volume,
                );
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'volume:remove': {
                const result = await this.#dockerMonitor?.volumeRemove(obj.message.id);
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'volume:prune': {
                const result = await this.#dockerMonitor?.volumePrune();
                this.sendTo(obj.from, obj.command, { result }, obj.callback);
                break;
            }
            case 'volume:file': {
                try {
                    const result = await this.#dockerMonitor?.volumeFile(obj.message.id, obj.message.file);
                    this.sendTo(obj.from, obj.command, { result }, obj.callback);
                } catch (e) {
                    this.sendTo(obj.from, obj.command, { error: (e as Error).message }, obj.callback);
                }
                break;
            }
            case 'volume:dir': {
                try {
                    const result = await this.#dockerMonitor?.volumeDir(obj.message.id, obj.message.path);
                    this.sendTo(
                        obj.from,
                        obj.command,
                        Array.isArray(result) ? { result } : { error: result },
                        obj.callback,
                    );
                } catch (e) {
                    this.sendTo(obj.from, obj.command, { error: (e as Error).message }, obj.callback);
                }
                break;
            }

            case 'info': {
                this.sendTo(
                    obj.from,
                    obj.command,
                    { result: await this.#dockerMonitor?.getDockerDaemonInfo() },
                    obj.callback,
                );
                break;
            }

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new DockerManagerAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new DockerManagerAdapter())();
}
