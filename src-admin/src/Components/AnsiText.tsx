import React from 'react';
import type { ITheme } from '@xterm/xterm';
import type { ThemeType } from '@iobroker/gui-components';

import { DARK_THEME, LIGHT_THEME } from './ContainerTerminal';

interface AnsiState {
    /** Index in the 256 color palette or CSS color */
    fg?: number | string;
    bg?: number | string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strike?: boolean;
    hidden?: boolean;
}

// CSI (e.g. ESC[1;32m), OSC (e.g. window title) or a short ESC sequence
// eslint-disable-next-line no-control-regex
const ESCAPE_REGEX = /\x1b\[([0-?]*)[ -/]*([@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[ -/]*[0-~]?/g;
// Control characters that are not printable (TAB and CR are handled separately)
// eslint-disable-next-line no-control-regex
const CONTROL_REGEX = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;

function getPalette(theme: ITheme): string[] {
    const palette = [
        theme.black,
        theme.red,
        theme.green,
        theme.yellow,
        theme.blue,
        theme.magenta,
        theme.cyan,
        theme.white,
        theme.brightBlack,
        theme.brightRed,
        theme.brightGreen,
        theme.brightYellow,
        theme.brightBlue,
        theme.brightMagenta,
        theme.brightCyan,
        theme.brightWhite,
    ] as string[];
    // 6x6x6 color cube
    const steps = [0, 95, 135, 175, 215, 255];
    for (let i = 0; i < 216; i++) {
        palette.push(`rgb(${steps[Math.floor(i / 36)]},${steps[Math.floor(i / 6) % 6]},${steps[i % 6]})`);
    }
    // Grayscale ramp
    for (let i = 0; i < 24; i++) {
        const v = 8 + i * 10;
        palette.push(`rgb(${v},${v},${v})`);
    }
    return palette;
}

const PALETTES: Record<ThemeType, string[]> = {
    dark: getPalette(DARK_THEME),
    light: getPalette(LIGHT_THEME),
};

/** Parse extended colors: `38;5;n` (256 colors) or `38;2;r;g;b` (true color). Returns the number of consumed params */
function parseExtendedColor(params: number[], i: number): { color?: number | string; consumed: number } {
    if (params[i + 1] === 5) {
        return { color: params[i + 2], consumed: 2 };
    }
    if (params[i + 1] === 2) {
        return { color: `rgb(${params[i + 2] || 0},${params[i + 3] || 0},${params[i + 4] || 0})`, consumed: 4 };
    }
    return { consumed: 0 };
}

/** Apply an SGR sequence (ESC[...m) to the state */
function applySgr(state: AnsiState, paramText: string): AnsiState {
    const params = paramText ? paramText.split(/[;:]/).map(p => parseInt(p, 10) || 0) : [0];
    let next: AnsiState = { ...state };
    for (let i = 0; i < params.length; i++) {
        const code = params[i];
        if (code === 0) {
            next = {};
        } else if (code === 1) {
            next.bold = true;
        } else if (code === 2) {
            next.dim = true;
        } else if (code === 3) {
            next.italic = true;
        } else if (code === 4) {
            next.underline = true;
        } else if (code === 7) {
            next.inverse = true;
        } else if (code === 8) {
            next.hidden = true;
        } else if (code === 9) {
            next.strike = true;
        } else if (code === 21 || code === 22) {
            next.bold = false;
            next.dim = false;
        } else if (code === 23) {
            next.italic = false;
        } else if (code === 24) {
            next.underline = false;
        } else if (code === 27) {
            next.inverse = false;
        } else if (code === 28) {
            next.hidden = false;
        } else if (code === 29) {
            next.strike = false;
        } else if (code >= 30 && code <= 37) {
            next.fg = code - 30;
        } else if (code === 38) {
            const { color, consumed } = parseExtendedColor(params, i);
            next.fg = color;
            i += consumed;
        } else if (code === 39) {
            next.fg = undefined;
        } else if (code >= 40 && code <= 47) {
            next.bg = code - 40;
        } else if (code === 48) {
            const { color, consumed } = parseExtendedColor(params, i);
            next.bg = color;
            i += consumed;
        } else if (code === 49) {
            next.bg = undefined;
        } else if (code >= 90 && code <= 97) {
            next.fg = code - 90 + 8;
        } else if (code >= 100 && code <= 107) {
            next.bg = code - 100 + 8;
        }
    }
    return next;
}

function toCss(state: AnsiState, palette: string[], theme: ITheme): React.CSSProperties | null {
    // Like xterm: bold text in one of the 8 base colors is shown in its bright variant
    const fgIndex = typeof state.fg === 'number' && state.bold && state.fg < 8 ? state.fg + 8 : state.fg;
    let fg = typeof fgIndex === 'number' ? palette[fgIndex] : fgIndex;
    let bg = typeof state.bg === 'number' ? palette[state.bg] : state.bg;
    if (state.inverse) {
        [fg, bg] = [bg || theme.background, fg || theme.foreground];
    }
    const style: React.CSSProperties = {};
    if (fg) {
        style.color = fg;
    }
    if (bg) {
        style.backgroundColor = bg;
    }
    if (state.bold) {
        style.fontWeight = 'bold';
    }
    if (state.dim) {
        style.opacity = 0.6;
    }
    if (state.italic) {
        style.fontStyle = 'italic';
    }
    if (state.underline || state.strike) {
        style.textDecoration = [state.underline ? 'underline' : '', state.strike ? 'line-through' : '']
            .filter(Boolean)
            .join(' ');
    }
    if (state.hidden) {
        style.visibility = 'hidden';
    }
    return Object.keys(style).length ? style : null;
}

/** Convert lines with ANSI escape sequences into styled React nodes */
function renderAnsi(lines: string[], themeType: ThemeType): React.ReactNode[] {
    const theme = themeType === 'dark' ? DARK_THEME : LIGHT_THEME;
    const palette = PALETTES[themeType];
    const result: React.ReactNode[] = [];
    // Colors may span several lines
    let state: AnsiState = {};

    for (let l = 0; l < lines.length; l++) {
        // Logs of TTY containers end with CRLF
        const line = lines[l].replace(/\r+$/, '');
        let lineNodes: React.ReactNode[] = [];
        const addText = (text: string): void => {
            // A carriage return inside the line (e.g. progress output) overwrites what was printed before
            const parts = text.split('\r');
            if (parts.length > 1) {
                lineNodes = [];
            }
            const clean = parts[parts.length - 1].replace(CONTROL_REGEX, '');
            if (clean) {
                const style = toCss(state, palette, theme);
                lineNodes.push(
                    style ? (
                        <span
                            key={`${l}_${lineNodes.length}`}
                            style={style}
                        >
                            {clean}
                        </span>
                    ) : (
                        clean
                    ),
                );
            }
        };

        let last = 0;
        ESCAPE_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = ESCAPE_REGEX.exec(line))) {
            addText(line.substring(last, match.index));
            if (match[2] === 'm') {
                state = applySgr(state, match[1]);
            }
            last = match.index + match[0].length;
        }
        addText(line.substring(last));

        result.push(...lineNodes);
        if (l < lines.length - 1) {
            result.push('\n');
        }
    }

    return result;
}

/** Remove ANSI escape sequences and control characters, e.g. to copy the text to the clipboard */
export function stripAnsi(lines: string[]): string {
    return lines
        .map(line => {
            // Like in the rendering: a carriage return inside the line overwrites what was printed before
            const parts = line.replace(/\r+$/, '').replace(ESCAPE_REGEX, '').split('\r');
            return parts[parts.length - 1].replace(CONTROL_REGEX, '');
        })
        .join('\n');
}

interface AnsiTextProps {
    /** Text lines, may contain ANSI escape sequences */
    lines: string[];
    themeType: ThemeType;
    /** Scroll to the last line when new lines are shown (e.g. to see the newest log entries) */
    scrollToEnd?: boolean;
    style?: React.CSSProperties;
}

/** Shows text (e.g. container logs) with ANSI colors like a terminal would */
export default function AnsiText(props: AnsiTextProps): React.JSX.Element {
    const { lines, themeType, scrollToEnd } = props;
    const content = React.useMemo(() => renderAnsi(lines, themeType), [lines, themeType]);
    const theme = themeType === 'dark' ? DARK_THEME : LIGHT_THEME;
    const preRef = React.useRef<HTMLPreElement>(null);

    // Only on new lines - not on every re-render, so the user can scroll up while the tab is polled
    React.useLayoutEffect(() => {
        if (scrollToEnd && preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight;
        }
    }, [lines, scrollToEnd]);

    return (
        <pre
            ref={preRef}
            style={{
                margin: 0,
                padding: 8,
                overflow: 'auto',
                fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
                fontSize: 13,
                lineHeight: 1.3,
                backgroundColor: theme.background,
                color: theme.foreground,
                ...props.style,
            }}
        >
            {content}
        </pre>
    );
}
