import React, { Component } from 'react';
import { Close as CloseIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { I18n, type AdminConnection } from '@iobroker/adapter-react-v5';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from '@mui/material';
import { size2string } from './utils';

export interface LsEntry {
    name: string;
    permissions: string;
    links?: number;
    owner?: string;
    group?: string;
    size: number;
    rawDate: string; // z.B. "Oct 9 14:17" oder "Oct 9 2024"
    isDir: boolean;
    isLink: boolean;
}

interface VolumeBrowserProps {
    socket: AdminConnection;
    volumeId: string;
    onClose: () => void;
    instance: number;
    alive: boolean;
}

interface VolumeBrowserState {
    dirs: { [name: string]: LsEntry[] | string }; // string if error
    currentPath: string;
    fileContent: string | null;
    fileName: string | null;
    fileError: string | null;
}

const ALLOWED_EXTENSIONS = [
    '.log',
    '.txt',
    '.json',
    '.xml',
    '.ts',
    '.js',
    '.ts',
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
    '.conf',
    '.config',
    '.toml',
    '.lock',
    '.csv',
    '.idxl',
    '.tsm',
    '.ini',
];

export default class VolumeBrowser extends Component<VolumeBrowserProps, VolumeBrowserState> {
    constructor(props: VolumeBrowserProps) {
        super(props);
        this.state = {
            dirs: {},
            currentPath: '/',
            fileContent: null,
            fileName: null,
            fileError: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.loadDir(this.state.currentPath);
    }

    async loadDir(path: string): Promise<void> {
        if (this.props.alive) {
            try {
                const result: { result?: LsEntry[]; error?: string } = await this.props.socket.sendTo(
                    `docker-manager.${this.props.instance}`,
                    'volume:dir',
                    {
                        id: this.props.volumeId,
                        path,
                    },
                );
                const dirs = { ...this.state.dirs };
                if (result.result) {
                    dirs[path] = result.result.filter(item => item.name !== '.' && item.name !== '..');
                } else {
                    dirs[path] = result.error || 'Unknown error';
                }

                this.setState({ dirs });
            } catch (error) {
                console.error('Failed to load directory:', error);
            }
        }
    }

    renderList(): React.JSX.Element {
        const list = this.state.dirs[this.state.currentPath];
        if (typeof list === 'string') {
            return <div style={{ color: 'red' }}>{list}</div>;
        }
        return (
            <Table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <TableHead>
                    <TableRow>
                        <TableCell style={{ width: 30, borderBottom: '1px solid #ccc', padding: '8px' }}></TableCell>
                        <TableCell style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Permissions')}
                        </TableCell>
                        <TableCell style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Owner')}
                        </TableCell>
                        <TableCell style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Group')}
                        </TableCell>
                        <TableCell style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Size')}
                        </TableCell>
                        <TableCell style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Date')}
                        </TableCell>
                        <TableCell style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '8px' }}>
                            {I18n.t('Name')}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {this.state.currentPath !== '/' ? (
                        <TableRow
                            style={{ cursor: 'pointer' }}
                            onClick={async () => {
                                const parentPath = this.state.currentPath.split('/').slice(0, -1).join('/');
                                const newPath = parentPath === '' ? '/' : parentPath;
                                this.setState({ currentPath: newPath });
                                if (!this.state.dirs[newPath]) {
                                    await this.loadDir(newPath);
                                }
                            }}
                        >
                            <td
                                colSpan={7}
                                style={{ padding: '8px', borderBottom: '1px solid #eee' }}
                            >
                                <ArrowBackIcon /> ..
                            </td>
                        </TableRow>
                    ) : null}
                    {list.map(entry => {
                        let allowView = false;
                        for (const ext of ALLOWED_EXTENSIONS) {
                            if (entry.name.toLowerCase().endsWith(ext)) {
                                allowView = true;
                                break;
                            }
                        }
                        if (!allowView && !entry.name.includes('.') && entry.size < 1024 * 10) {
                            // files without extension but small - allow to view
                            allowView = true;
                        }
                        if (!allowView && !entry.name.split('.')[0].length && entry.size < 1024) {
                            // files without name but with extension and small - allow to view
                            allowView = true;
                        }
                        if (entry.isDir && allowView) {
                            allowView = false;
                        }
                        if (!entry.size) {
                            allowView = false;
                        }

                        return (
                            <TableRow
                                key={entry.name}
                                style={{ cursor: entry.isDir || allowView ? 'pointer' : 'default' }}
                                onClick={async () => {
                                    if (entry.isDir) {
                                        const newPath =
                                            this.state.currentPath === '/'
                                                ? `/${entry.name}`
                                                : `${this.state.currentPath}/${entry.name}`;
                                        this.setState({ currentPath: newPath });
                                        if (!this.state.dirs[newPath]) {
                                            await this.loadDir(newPath);
                                        }
                                    } else if (allowView) {
                                        this.setState({ fileName: entry.name, fileContent: null, fileError: null });
                                        try {
                                            const result: { result?: string; error?: string } =
                                                await this.props.socket.sendTo(
                                                    `docker-manager.${this.props.instance}`,
                                                    'volume:file',
                                                    {
                                                        id: this.props.volumeId,
                                                        file: `${this.state.currentPath}/${entry.name}`,
                                                    },
                                                );
                                            if (result.result) {
                                                this.setState({ fileContent: result.result });
                                            } else {
                                                this.setState({
                                                    fileError: result.error || 'Unknown error',
                                                });
                                            }
                                        } catch (error) {
                                            this.setState({ fileError: `Cannot load file: ${error}` });
                                        }
                                    }
                                }}
                            >
                                <TableCell style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                                    {entry.isDir ? '📁' : entry.isLink ? '🔗' : '📄'}
                                </TableCell>
                                <TableCell
                                    style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}
                                >
                                    {entry.permissions}
                                </TableCell>
                                <TableCell
                                    style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}
                                >
                                    {entry.owner || '-'}
                                </TableCell>
                                <TableCell
                                    style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}
                                >
                                    {entry.group || '-'}
                                </TableCell>
                                <TableCell
                                    style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}
                                >
                                    {entry.size ? size2string(entry.size) : entry.size === 0 ? '0 B' : '-'}
                                </TableCell>
                                <TableCell
                                    style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}
                                >
                                    {entry.rawDate}
                                </TableCell>
                                <TableCell
                                    style={{
                                        textAlign: 'left',
                                        padding: '8px',
                                        borderBottom: '1px solid #eee',
                                        fontWeight: entry.isDir ? 'bold' : 'normal',
                                    }}
                                >
                                    {entry.name}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        );
    }

    renderBreadcrumbs(): React.JSX.Element {
        const parts = this.state.currentPath.split('/').filter(part => part);
        const breadcrumbs = [];
        let path = '';
        breadcrumbs.push(
            <span
                key="/"
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={async () => {
                    this.setState({ currentPath: '/' });
                    if (!this.state.dirs['/']) {
                        await this.loadDir('/');
                    }
                }}
            >
                /
            </span>,
        );
        for (let i = 0; i < parts.length; i++) {
            path += `${parts[i]}/`;
            breadcrumbs.push(
                <span
                    key={`${path}-link`}
                    id={`BROWSER-${path}`}
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={async (e): Promise<void> => {
                        const strPath = e.currentTarget.id.substring(8);
                        this.setState({ currentPath: strPath });
                        if (!this.state.dirs[strPath]) {
                            await this.loadDir(strPath);
                        }
                    }}
                >
                    {`${parts[i]}/`}
                </span>,
            );
        }
        return <div style={{ marginBottom: 16 }}>{breadcrumbs}</div>;
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
                        <div style={{ color: 'red' }}>{this.state.fileError}</div>
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
        const list = this.state.dirs[this.state.currentPath];

        return (
            <Dialog
                open={true}
                onClose={this.props.onClose}
                fullWidth
                maxWidth="md"
            >
                {this.renderViewer()}
                <DialogTitle>
                    {I18n.t('Volume')}
                    <span> - {this.props.volumeId}</span>
                </DialogTitle>
                <DialogContent
                    dividers
                    style={{ height: '70vh', overflowY: 'auto' }}
                >
                    <div style={{ width: '100%', fontWeight: 'bold', fontSize: 'larger' }}>
                        {this.renderBreadcrumbs()}
                    </div>
                    <div style={{ width: '100%', height: 'calc(100% - 42px)', overflowY: 'auto' }}>
                        {list ? this.renderList() : <LinearProgress />}
                    </div>
                </DialogContent>
                <DialogActions>
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
