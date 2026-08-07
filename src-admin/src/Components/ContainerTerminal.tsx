import React, { Component } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ThemeType } from '@iobroker/gui-components';

import '@xterm/xterm/css/xterm.css';
import type { GUIResponseTerminal } from '../types';

const DARK_THEME: ITheme = {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#1e1e1e',
    red: '#f44747',
    green: '#6a9955',
    yellow: '#d7ba7d',
    blue: '#569cd6',
    magenta: '#c586c0',
    cyan: '#4ec9b0',
    white: '#d4d4d4',
    brightBlack: '#808080',
    brightRed: '#f44747',
    brightGreen: '#6a9955',
    brightYellow: '#d7ba7d',
    brightBlue: '#569cd6',
    brightMagenta: '#c586c0',
    brightCyan: '#4ec9b0',
    brightWhite: '#ffffff',
};

const LIGHT_THEME: ITheme = {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000',
    red: '#cd3131',
    green: '#008000',
    yellow: '#795e26',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#cd3131',
    brightGreen: '#14ce14',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5',
};

interface ContainerTerminalProps {
    /** Container ID the shell runs in */
    containerId: string;
    /** Shell to start, e.g. /bin/sh or /bin/bash */
    shell: string;
    themeType: ThemeType;
    onTerminalStart: (containerId: string, shell: string, cb: (data: GUIResponseTerminal) => void) => void;
    onTerminalSend: (containerId: string, data: string) => void;
    onTerminalResize: (containerId: string, cols: number, rows: number) => void;
    onTerminalStop: (containerId: string) => void;
}

export default class ContainerTerminal extends Component<ContainerTerminalProps> {
    private readonly containerRef = React.createRef<HTMLDivElement>();
    private term: Terminal | null = null;
    private fitAddon: FitAddon | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private fitTimer: ReturnType<typeof setTimeout> | null = null;

    componentDidMount(): void {
        if (!this.containerRef.current) {
            return;
        }

        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 5000,
            fontSize: 14,
            fontFamily: 'Consolas, "Courier New", monospace',
            allowProposedApi: true,
            theme: this.props.themeType === 'dark' ? DARK_THEME : LIGHT_THEME,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        term.open(this.containerRef.current);

        // WebGL renderer is optional - fall back silently if not supported
        try {
            const webglAddon = new WebglAddon();
            webglAddon.onContextLoss(() => webglAddon.dispose());
            term.loadAddon(webglAddon);
        } catch {
            // ignore
        }

        fitAddon.fit();

        // forward keystrokes to the container shell
        term.onData(data => this.props.onTerminalSend(this.props.containerId, data));

        this.term = term;
        this.fitAddon = fitAddon;

        // start the backend shell and pipe its output into the terminal
        this.props.onTerminalStart(this.props.containerId, this.props.shell, this.onServerData);

        // send the initial size
        this.props.onTerminalResize(this.props.containerId, term.cols, term.rows);

        // refit whenever the dialog/window changes size
        this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
        this.resizeObserver.observe(this.containerRef.current);
        window.addEventListener('resize', this.scheduleFit);

        term.focus();
    }

    componentWillUnmount(): void {
        if (this.fitTimer) {
            clearTimeout(this.fitTimer);
            this.fitTimer = null;
        }
        window.removeEventListener('resize', this.scheduleFit);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.props.onTerminalStop(this.props.containerId);
        this.term?.dispose();
        this.term = null;
        this.fitAddon = null;
    }

    componentDidUpdate(prevProps: ContainerTerminalProps): void {
        if (this.term && prevProps.themeType !== this.props.themeType) {
            this.term.options.theme = this.props.themeType === 'dark' ? DARK_THEME : LIGHT_THEME;
        }
    }

    onServerData = (update: GUIResponseTerminal): void => {
        if (!this.term) {
            return;
        }
        if (update.data) {
            this.term.write(update.data);
        }
        if (update.error) {
            this.term.write(`\r\n\x1b[31m${update.error}\x1b[0m\r\n`);
        }
        if (update.exit) {
            this.term.write('\r\n\x1b[90m[Process completed]\x1b[0m\r\n');
        }
    };

    scheduleFit = (): void => {
        if (this.fitTimer) {
            clearTimeout(this.fitTimer);
        }
        this.fitTimer = setTimeout(() => {
            this.fitTimer = null;
            if (this.fitAddon && this.term && this.containerRef.current?.offsetParent !== null) {
                try {
                    this.fitAddon.fit();
                } catch {
                    // ignore - terminal may be detached
                }
                this.props.onTerminalResize(this.props.containerId, this.term.cols, this.term.rows);
            }
        }, 100);
    };

    render(): React.JSX.Element {
        return (
            <div
                ref={this.containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    backgroundColor: this.props.themeType === 'dark' ? '#1e1e1e' : '#ffffff',
                }}
            />
        );
    }
}
