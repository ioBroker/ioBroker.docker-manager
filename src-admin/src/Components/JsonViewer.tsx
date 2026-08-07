import React, { useState, type JSX } from 'react';
import {
    KeyboardArrowRight as ClosedIcon,
    KeyboardArrowDown as OpenIcon,
    UnfoldMore as ExpandAllIcon,
    UnfoldLess as CollapseAllIcon,
    ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { I18n } from '@iobroker/gui-components';

/** Colors per JSON token type. The values follow the same VS Code palette as the container terminal. */
interface TokenColors {
    key: string;
    index: string;
    string: string;
    number: string;
    boolean: string;
    nullish: string;
    meta: string;
}

const DARK: TokenColors = {
    key: '#9cdcfe',
    index: '#808080',
    string: '#ce9178',
    number: '#b5cea8',
    boolean: '#569cd6',
    nullish: '#808080',
    meta: '#808080',
};

const LIGHT: TokenColors = {
    key: '#0451a5',
    index: '#707070',
    string: '#a31515',
    number: '#098658',
    boolean: '#0000ff',
    nullish: '#707070',
    meta: '#707070',
};

/** Indent per nesting level, in pixels */
const INDENT = 16;
/** Width of the chevron column - leaves reserve it too, so that values stay aligned */
const CHEVRON = 20;

function isBranch(value: unknown): value is Record<string, unknown> | unknown[] {
    return value !== null && typeof value === 'object';
}

function renderPrimitive(value: unknown, colors: TokenColors): JSX.Element {
    if (value === null) {
        return (
            <Box
                component="span"
                sx={{ color: colors.nullish }}
            >
                null
            </Box>
        );
    }
    switch (typeof value) {
        case 'string':
            return (
                <Box
                    component="span"
                    sx={{ color: colors.string, wordBreak: 'break-word' }}
                >
                    &quot;{value}&quot;
                </Box>
            );
        case 'number':
        case 'bigint':
            return (
                <Box
                    component="span"
                    sx={{ color: colors.number }}
                >
                    {String(value)}
                </Box>
            );
        case 'boolean':
            return (
                <Box
                    component="span"
                    sx={{ color: colors.boolean }}
                >
                    {String(value)}
                </Box>
            );
        default:
            // undefined, symbol, function - none of these survive a JSON round trip, so name the
            // type rather than stringify a value that has no meaningful text form
            return (
                <Box
                    component="span"
                    sx={{ color: colors.nullish }}
                >
                    {value === undefined ? 'undefined' : typeof value}
                </Box>
            );
    }
}

interface JsonNodeProps {
    /** Property name, or the array index. Absent for the root node. */
    name?: string;
    /** Whether `name` is an array index - those are dimmed instead of highlighted */
    isIndex?: boolean;
    value: unknown;
    depth: number;
    /** Nodes below this depth start expanded */
    expandDepth: number;
    colors: TokenColors;
}

function JsonNode({ name, isIndex, value, depth, expandDepth, colors }: JsonNodeProps): JSX.Element {
    const [open, setOpen] = useState(depth < expandDepth);

    const label =
        name === undefined ? null : (
            <>
                <Box
                    component="span"
                    sx={{ color: isIndex ? colors.index : colors.key }}
                >
                    {isIndex ? name : `"${name}"`}
                </Box>
                <Box
                    component="span"
                    sx={{ color: colors.meta }}
                >
                    :{' '}
                </Box>
            </>
        );

    if (!isBranch(value)) {
        return (
            <Box sx={{ pl: `${depth * INDENT + CHEVRON}px` }}>
                {label}
                {renderPrimitive(value, colors)}
            </Box>
        );
    }

    const isArray = Array.isArray(value);
    const entries: [string, unknown][] = isArray ? value.map((item, i) => [String(i), item]) : Object.entries(value);
    const [openBracket, closeBracket] = isArray ? ['[', ']'] : ['{', '}'];

    if (!entries.length) {
        return (
            <Box sx={{ pl: `${depth * INDENT + CHEVRON}px` }}>
                {label}
                <Box
                    component="span"
                    sx={{ color: colors.meta }}
                >
                    {openBracket}
                    {closeBracket}
                </Box>
            </Box>
        );
    }

    return (
        <>
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    pl: `${depth * INDENT}px`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'action.hover' },
                }}
            >
                <Box sx={{ width: CHEVRON, flexShrink: 0, color: colors.meta, display: 'flex' }}>
                    {open ? <OpenIcon fontSize="small" /> : <ClosedIcon fontSize="small" />}
                </Box>
                <Box component="span">
                    {label}
                    <Box
                        component="span"
                        sx={{ color: colors.meta }}
                    >
                        {open ? openBracket : `${openBracket} … ${closeBracket} (${entries.length})`}
                    </Box>
                </Box>
            </Box>
            {open ? (
                <>
                    {entries.map(([entryName, entryValue]) => (
                        <JsonNode
                            key={entryName}
                            name={entryName}
                            isIndex={isArray}
                            value={entryValue}
                            depth={depth + 1}
                            expandDepth={expandDepth}
                            colors={colors}
                        />
                    ))}
                    <Box sx={{ pl: `${depth * INDENT + CHEVRON}px`, color: colors.meta }}>{closeBracket}</Box>
                </>
            ) : null}
        </>
    );
}

interface JsonViewerProps {
    data: unknown;
    /** Nodes below this depth are expanded initially */
    defaultExpandedDepth?: number;
}

/**
 * A collapsible view of a JSON structure - `docker inspect` output is deeply nested, and as one
 * pre-formatted block it can only be scrolled, not navigated.
 */
export default function JsonViewer({ data, defaultExpandedDepth = 2 }: JsonViewerProps): JSX.Element {
    const theme = useTheme();
    const colors = theme.palette.mode === 'dark' ? DARK : LIGHT;
    const [expandDepth, setExpandDepth] = useState(defaultExpandedDepth);
    // The nodes keep their own open state, so changing the depth alone would not reach them.
    // Bumping the key remounts the tree and lets every node pick the new depth up.
    const [generation, setGeneration] = useState(0);

    const applyDepth = (depth: number): void => {
        setExpandDepth(depth);
        setGeneration(value => value + 1);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                <Tooltip title={I18n.t('Expand all')}>
                    <IconButton
                        size="small"
                        onClick={() => applyDepth(Number.POSITIVE_INFINITY)}
                    >
                        <ExpandAllIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title={I18n.t('Collapse all')}>
                    {/* 1 and not 0, so that the root object stays open and only its children fold away */}
                    <IconButton
                        size="small"
                        onClick={() => applyDepth(1)}
                    >
                        <CollapseAllIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title={I18n.t('Copy to clipboard')}>
                    <IconButton
                        size="small"
                        onClick={() =>
                            navigator.clipboard
                                .writeText(JSON.stringify(data, null, 2))
                                .catch(error => console.error(error))
                        }
                    >
                        <CopyIcon />
                    </IconButton>
                </Tooltip>
            </Box>
            <Box
                key={generation}
                sx={{
                    flexGrow: 1,
                    overflow: 'auto',
                    fontFamily: 'Consolas, "Courier New", monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                }}
            >
                <JsonNode
                    value={data}
                    depth={0}
                    expandDepth={expandDepth}
                    colors={colors}
                />
            </Box>
        </Box>
    );
}
