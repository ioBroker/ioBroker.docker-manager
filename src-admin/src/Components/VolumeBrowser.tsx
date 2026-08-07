import React, { Component } from 'react';
import {
    Close as CloseIcon,
    Refresh as RefreshIcon,
    UnfoldLess as CollapseAllIcon,
    Folder as FolderIcon,
    FolderOpen as FolderOpenIcon,
    InsertDriveFileOutlined as FileIcon,
    Link as LinkIcon,
    KeyboardArrowRight as ClosedIcon,
    KeyboardArrowDown as OpenIcon,
} from '@mui/icons-material';
import { I18n, type AdminConnection } from '@iobroker/gui-components';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import { size2string } from './utils';

export interface LsEntry {
    name: string;
    /** Target of a symlink - `ls -l` prints it as "name -> target", it is not part of the name */
    linkTarget?: string;
    permissions: string;
    links?: number;
    owner?: string;
    group?: string;
    size: number;
    rawDate: string; // z.B. "Oct 9 14:17" oder "Oct 9 2024"
    isDir: boolean;
    isLink: boolean;
}

/**
 * Largest file the viewer will fetch. The content travels through the socket as one string and is
 * rendered into a single <pre>, so without a cap a big log file freezes the browser tab.
 */
const MAX_VIEW_SIZE = 1024 * 1024;

/** Indent per tree level, in pixels */
const INDENT = 18;

/** Absolute path with a leading slash and without a trailing one, so that '/' stays '/' */
function normalizePath(path: string): string {
    const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

/** Append a directory or file name to a path */
function joinPath(base: string, name: string): string {
    return normalizePath(`${base}/${name}`);
}

/** Directories first, then by name - the order a file explorer is expected to show */
function sortEntries(entries: LsEntry[]): LsEntry[] {
    return [...entries].sort((a, b) => {
        if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

const ALLOWED_EXTENSIONS = [
    '.log',
    '.txt',
    '.json',
    '.xml',
    '.ts',
    '.js',
    '.css',
    '.html',
    '.md',
    '.yml',
    '.yaml',
    '.conf',
    '.config',
    '.sh',
    '.bat',
    '.cmd',
    '.ps1',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.go',
    '.rs',
    '.php',
    '.rb',
    '.pl',
    '.swift',
    '.kt',
    '.kts',
    '.sql',
    '.tsv',
    '.env',
    '.dockerfile',
    '.cfg',
    '.toml',
    '.lock',
    '.csv',
    '.idxl',
    '.tsm',
    '.ini',
];

/** Can this entry be opened in the text viewer? */
function isViewable(entry: LsEntry): boolean {
    const lower = entry.name.toLowerCase();
    // Symlinks are excluded: `ls` reports them as neither file nor directory, so following one
    // would guess wrong about what it points at.
    if (entry.isDir || entry.isLink || !entry.size || entry.size > MAX_VIEW_SIZE) {
        return false;
    }
    return (
        ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext)) ||
        // no extension at all but small - very likely a config or text file
        (!entry.name.includes('.') && entry.size < 10 * 1024) ||
        // dotfile without an extension, e.g. ".env"
        (!entry.name.split('.')[0].length && entry.size < 1024)
    );
}

interface VolumeBrowserProps {
    socket: AdminConnection;
    volumeId: string;
    onClose: () => void;
    instance: number;
    alive: boolean;
}

interface VolumeBrowserState {
    /** Listing per directory path, or the error text if it could not be read */
    dirs: { [path: string]: LsEntry[] | string };
    /** Directories currently expanded in the tree */
    expanded: string[];
    /** Directories whose listing is on its way */
    loading: string[];
    /** Path of the highlighted row */
    selected: string;
    fileContent: string | null;
    fileName: string | null;
    fileError: string | null;
}

export default class VolumeBrowser extends Component<VolumeBrowserProps, VolumeBrowserState> {
    constructor(props: VolumeBrowserProps) {
        super(props);
        this.state = {
            dirs: {},
            expanded: ['/'],
            loading: [],
            selected: '',
            fileContent: null,
            fileName: null,
            fileError: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.loadDir('/');
    }

    async loadDir(path: string): Promise<void> {
        if (!this.props.alive) {
            // Without this the tree would sit on the progress bar forever, waiting for a backend
            // that is not running.
            this.setState({ dirs: { ...this.state.dirs, [path]: I18n.t('Backend is not running') } });
            return;
        }
        this.setState({ loading: [...this.state.loading, path] });
        let entry: LsEntry[] | string;
        try {
            const result: { result?: LsEntry[]; error?: string } = await this.props.socket.sendTo(
                `docker-manager.${this.props.instance}`,
                'volume:dir',
                {
                    id: this.props.volumeId,
                    path,
                },
            );
            entry = result.result
                ? result.result.filter(item => item.name !== '.' && item.name !== '..')
                : result.error || I18n.t('Unknown error');
        } catch (error) {
            // A rejected sendTo used to be logged to the console only, which left `dirs[path]`
            // unset and the tree showing an endless progress bar.
            entry = `${I18n.t('Cannot read directory')}: ${error instanceof Error ? error.message : String(error)}`;
        }
        this.setState({
            dirs: { ...this.state.dirs, [path]: entry },
            loading: this.state.loading.filter(it => it !== path),
        });
    }

    /** Expand or collapse a directory, reading its content on first expand */
    toggleDir(path: string): void {
        if (this.state.expanded.includes(path)) {
            this.setState({ expanded: this.state.expanded.filter(it => it !== path), selected: path });
            return;
        }
        this.setState({ expanded: [...this.state.expanded, path], selected: path }, () => {
            if (!this.state.dirs[path]) {
                void this.loadDir(path);
            }
        });
    }

    /** Forget every cached listing and read the expanded directories again */
    refresh(): void {
        const expanded = this.state.expanded;
        this.setState({ dirs: {} }, () => expanded.forEach(path => void this.loadDir(path)));
    }

    async openFile(path: string, entry: LsEntry): Promise<void> {
        this.setState({ selected: path, fileName: entry.name, fileContent: null, fileError: null });
        try {
            const result: { result?: string; error?: string } = await this.props.socket.sendTo(
                `docker-manager.${this.props.instance}`,
                'volume:file',
                {
                    id: this.props.volumeId,
                    file: path,
                },
            );
            if (result.result) {
                this.setState({ fileContent: result.result });
            } else {
                this.setState({ fileError: result.error || I18n.t('Unknown error') });
            }
        } catch (error) {
            this.setState({
                fileError: `${I18n.t('Cannot load file')}: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    /** A row spanning all columns, used for the "loading", "empty" and "error" states of a subtree */
    static renderNote(key: string, depth: number, content: React.ReactNode, color: string): React.JSX.Element {
        return (
            <TableRow key={key}>
                <TableCell
                    colSpan={5}
                    sx={{ pl: `${depth * INDENT + 30}px`, color, fontStyle: 'italic' }}
                >
                    {content}
                </TableCell>
            </TableRow>
        );
    }

    /** Render the content of one directory, recursing into the expanded ones */
    renderRows(path: string, depth: number): React.JSX.Element[] {
        const list = this.state.dirs[path];

        if (list === undefined) {
            return this.state.loading.includes(path)
                ? [VolumeBrowser.renderNote(`${path}#load`, depth, <CircularProgress size={14} />, 'text.secondary')]
                : [];
        }
        if (typeof list === 'string') {
            return [VolumeBrowser.renderNote(`${path}#err`, depth, list, 'error.main')];
        }
        if (!list.length) {
            return [VolumeBrowser.renderNote(`${path}#empty`, depth, I18n.t('Folder is empty'), 'text.secondary')];
        }

        const rows: React.JSX.Element[] = [];

        for (const entry of sortEntries(list)) {
            const childPath = joinPath(path, entry.name);
            const expanded = this.state.expanded.includes(childPath);
            const viewable = isViewable(entry);
            const clickable = entry.isDir || viewable;
            const tooBig = !entry.isDir && !entry.isLink && entry.size > MAX_VIEW_SIZE;

            rows.push(
                <TableRow
                    key={childPath}
                    hover={clickable}
                    selected={this.state.selected === childPath}
                    title={
                        tooBig ? `${I18n.t('File is too big to display')} (> ${size2string(MAX_VIEW_SIZE)})` : undefined
                    }
                    sx={{ cursor: clickable ? 'pointer' : 'default' }}
                    onClick={() => {
                        if (entry.isDir) {
                            this.toggleDir(childPath);
                        } else if (viewable) {
                            void this.openFile(childPath, entry);
                        } else {
                            this.setState({ selected: childPath });
                        }
                    }}
                >
                    <TableCell sx={{ pl: `${depth * INDENT + 8}px`, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {/* The chevron column is kept even for files, so that names stay aligned */}
                        <Box sx={{ width: 20, display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                            {entry.isDir ? (
                                expanded ? (
                                    <OpenIcon fontSize="small" />
                                ) : (
                                    <ClosedIcon fontSize="small" />
                                )
                            ) : null}
                        </Box>
                        {entry.isDir ? (
                            expanded ? (
                                <FolderOpenIcon sx={{ color: '#f5b73d' }} />
                            ) : (
                                <FolderIcon sx={{ color: '#f5b73d' }} />
                            )
                        ) : entry.isLink ? (
                            <LinkIcon sx={{ color: 'text.secondary' }} />
                        ) : (
                            <FileIcon sx={{ color: 'text.secondary' }} />
                        )}
                        <Box
                            component="span"
                            sx={{ fontWeight: entry.isDir ? 600 : 400, ml: 0.5 }}
                        >
                            {entry.name}
                        </Box>
                        {entry.linkTarget ? (
                            <Box
                                component="span"
                                sx={{ color: 'text.secondary' }}
                            >
                                → {entry.linkTarget}
                            </Box>
                        ) : null}
                    </TableCell>
                    <TableCell
                        align="right"
                        sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                    >
                        {entry.isDir ? '' : size2string(entry.size)}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{entry.rawDate}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {entry.permissions}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {`${entry.owner || '-'} / ${entry.group || '-'}`}
                    </TableCell>
                </TableRow>,
            );

            if (entry.isDir && expanded) {
                rows.push(...this.renderRows(childPath, depth + 1));
            }
        }

        return rows;
    }

    renderTree(): React.JSX.Element {
        return (
            <Table
                size="small"
                stickyHeader
            >
                <TableHead>
                    <TableRow>
                        <TableCell>{I18n.t('Name')}</TableCell>
                        <TableCell
                            align="right"
                            sx={{ width: 100 }}
                        >
                            {I18n.t('Size')}
                        </TableCell>
                        <TableCell sx={{ width: 140 }}>{I18n.t('Date')}</TableCell>
                        <TableCell sx={{ width: 120 }}>{I18n.t('Permissions')}</TableCell>
                        <TableCell sx={{ width: 150 }}>{`${I18n.t('Owner')} / ${I18n.t('Group')}`}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>{this.renderRows('/', 0)}</TableBody>
            </Table>
        );
    }

    renderViewer(): React.JSX.Element | null {
        if (!this.state.fileName) {
            return null;
        }
        return (
            <Dialog
                open={true}
                onClose={() => this.setState({ fileName: null, fileContent: null, fileError: null })}
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle>{this.state.fileName}</DialogTitle>
                <DialogContent
                    dividers
                    style={{ height: '70vh', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
                >
                    {this.state.fileContent !== null ? (
                        <pre>{this.state.fileContent}</pre>
                    ) : this.state.fileError ? (
                        <Box sx={{ color: 'error.main' }}>{this.state.fileError}</Box>
                    ) : (
                        <LinearProgress />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            if (this.state.fileContent) {
                                navigator.clipboard
                                    .writeText(this.state.fileContent)
                                    .catch(error => console.error(error));
                            }
                        }}
                    >
                        {I18n.t('Copy to clipboard')}
                    </Button>
                    <Button
                        onClick={() => this.setState({ fileName: null, fileContent: null, fileError: null })}
                        color="primary"
                        variant="contained"
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        const root = this.state.dirs['/'];

        return (
            <Dialog
                open={true}
                onClose={this.props.onClose}
                fullWidth
                maxWidth="lg"
            >
                {this.renderViewer()}
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {I18n.t('Volume')}
                        <Box
                            component="span"
                            sx={{ color: 'text.secondary', ml: 1, fontSize: '0.8em' }}
                        >
                            {this.props.volumeId}
                        </Box>
                    </Box>
                    <Box sx={{ marginLeft: 'auto', display: 'flex', gap: 0.5 }}>
                        <Tooltip title={I18n.t('Collapse all')}>
                            <span>
                                <IconButton
                                    size="small"
                                    disabled={this.state.expanded.length <= 1}
                                    onClick={() => this.setState({ expanded: ['/'] })}
                                >
                                    <CollapseAllIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={I18n.t('Refresh')}>
                            <IconButton
                                size="small"
                                onClick={() => this.refresh()}
                            >
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </DialogTitle>
                <DialogContent
                    dividers
                    sx={{ height: '70vh', p: 0, overflow: 'auto' }}
                >
                    {root === undefined && this.state.loading.includes('/') ? <LinearProgress /> : this.renderTree()}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between' }}>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', pl: 1 }}
                    >
                        {Array.isArray(root)
                            ? `${root.filter(e => e.isDir).length} ${I18n.t('Folders')}, ${root.filter(e => !e.isDir).length} ${I18n.t('Files')}`
                            : ''}
                    </Typography>
                    <Button
                        onClick={this.props.onClose}
                        color="primary"
                        variant="contained"
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
