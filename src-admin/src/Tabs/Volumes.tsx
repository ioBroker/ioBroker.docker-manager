import React, { Component } from 'react';
import {
    Fab,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Dialog,
    DialogContent,
    DialogActions,
    DialogTitle,
    Button,
    TextField,
    IconButton,
    CircularProgress,
    Snackbar,
    InputLabel,
    Select,
    MenuItem,
    FormControl,
} from '@mui/material';

import { type AdminConnection, I18n, InfoBox } from '@iobroker/gui-components';
import { Add as AddIcon, Delete as DeleteIcon, Warning as AlertIcon, Close as CloseIcon } from '@mui/icons-material';

import type { VolumeInfo, NetworkDriver } from '@iobroker/plugin-docker';
import VolumeBrowser from '../Components/VolumeBrowser';

interface VolumesTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    volumes: VolumeInfo[] | undefined;
    removeSupported: boolean;
}

interface VolumesTabState {
    showAddDialog: boolean;
    showDeleteDialog: string;
    addVolumePath: string;
    showPruneDialog: boolean;
    addVolumeName: string;
    addNetworkDriver: NetworkDriver | '';
    requesting: boolean;
    showHint: string;
    showError: string;
    browseVolume: string;
}

export default class VolumesTab extends Component<VolumesTabProps, VolumesTabState> {
    constructor(props: VolumesTabProps) {
        super(props);
        this.state = {
            showAddDialog: false,
            showDeleteDialog: '',
            addVolumeName: '',
            addNetworkDriver: '',
            addVolumePath: '',
            requesting: false,
            showHint: '',
            showError: '',
            browseVolume: '',
            showPruneDialog: false,
        };
    }

    renderBrowseDialog(): React.JSX.Element | null {
        if (!this.state.browseVolume) {
            return null;
        }
        return (
            <VolumeBrowser
                socket={this.props.socket}
                instance={this.props.instance}
                volumeId={this.state.browseVolume}
                onClose={() => this.setState({ browseVolume: '' })}
                alive={this.props.alive}
            />
        );
    }

    renderAddDialog(): React.JSX.Element | null {
        if (!this.state.showAddDialog) {
            return null;
        }
        return (
            <Dialog
                open={!0}
                fullWidth
                maxWidth="sm"
                sx={{
                    '& .MuiDialog-paper': {
                        overflow: 'visible',
                    },
                }}
                onClose={() => this.setState({ showAddDialog: false })}
            >
                <DialogTitle>{I18n.t('Create new volume')}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        value={this.state.addVolumeName}
                        onChange={e => this.setState({ addVolumeName: e.target.value })}
                        label={I18n.t('Volume name')}
                        variant="standard"
                        disabled={this.state.requesting}
                    />
                    <FormControl
                        fullWidth
                        variant="standard"
                        style={{ marginTop: 20, marginBottom: 20 }}
                    >
                        <InputLabel>{I18n.t('Driver')}</InputLabel>
                        <Select
                            disabled={this.state.requesting}
                            variant="standard"
                            value={this.state.addNetworkDriver || ''}
                            onChange={e =>
                                this.setState({
                                    addNetworkDriver: e.target.value.trim().replace(/\s/g, '') as NetworkDriver | '',
                                })
                            }
                        >
                            <MenuItem value="">default</MenuItem>
                            <MenuItem value="local">local</MenuItem>
                            <MenuItem value="tmpfs">tmpfs</MenuItem>
                            <MenuItem value="nfs">nfs</MenuItem>
                            <MenuItem value="cifs">cifs</MenuItem>
                            <MenuItem value="sshfs">sshfs</MenuItem>
                            <MenuItem value="flocker">flocker</MenuItem>
                            <MenuItem value="glusterfs">glusterfs</MenuItem>
                            <MenuItem value="ceph">ceph</MenuItem>
                            <MenuItem value="rexray">rexray</MenuItem>
                            <MenuItem value="portworx">portworx</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        value={this.state.addVolumePath}
                        onChange={e => this.setState({ addVolumePath: e.target.value })}
                        label={I18n.t('Volume path (for drivers that need it)')}
                        variant="standard"
                        disabled={this.state.requesting}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={
                            this.state.requesting ||
                            !this.state.addVolumeName.trim() ||
                            !!this.props.volumes?.find(v => v.name === this.state.addVolumeName.trim())
                        }
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'volume:create',
                                        {
                                            name: this.state.addVolumeName,
                                            driver: this.state.addNetworkDriver || undefined,
                                            volume: this.state.addVolumePath || undefined,
                                        },
                                    );
                                    this.setState({ showAddDialog: false, requesting: false });
                                } catch (e) {
                                    console.error(`Cannot create network ${this.state.showAddDialog}: ${e}`);
                                    alert(`Cannot create network ${this.state.showAddDialog}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Create')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showAddDialog: false })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (!this.state.showDeleteDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showDeleteDialog: '' })}
            >
                <DialogTitle>{I18n.t('Remove volume')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete volume "%s"?', this.state.showDeleteDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    const result: { result: { stdout: string; stderr: string } } =
                                        await this.props.socket.sendTo(
                                            `docker-manager.${this.props.instance}`,
                                            'volume:remove',
                                            {
                                                id: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        showDeleteDialog: '',
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                        requesting: false,
                                    });
                                } catch (e) {
                                    console.error(`Cannot delete volume ${this.state.showDeleteDialog}: ${e}`);
                                    alert(`Cannot delete volume ${this.state.showDeleteDialog}: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot delete volume ${this.state.showDeleteDialog}: ${e}`,
                                    });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <DeleteIcon />}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showDeleteDialog: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderSnackbar(): React.ReactNode {
        let text: React.JSX.Element[] = [];
        if (this.state.showHint) {
            text = this.state.showHint
                .split('\n')
                .filter(line => line.trim())
                .map((line, i) => (
                    <div
                        key={i}
                        style={{ color: line.includes('up to date') ? 'green' : undefined }}
                    >
                        {line}
                    </div>
                ));
        }

        return (
            <Snackbar
                open={!!this.state.showHint}
                autoHideDuration={5000}
                onClose={() => this.setState({ showHint: '' })}
                message={text}
                action={
                    <IconButton
                        size="small"
                        aria-label="close"
                        color="inherit"
                        onClick={() => this.setState({ showHint: '' })}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                }
            />
        );
    }

    renderErrorDialog(): React.JSX.Element | null {
        if (!this.state.showError) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showError: '' })}
            >
                <DialogTitle>{I18n.t('Error')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <AlertIcon style={{ color: 'yellow' }} />
                    {this.state.showError}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showError: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmPruneDialog(): React.JSX.Element | null {
        if (!this.state.showPruneDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showPruneDialog: false })}
            >
                <DialogTitle>{I18n.t('Prune unused volumes')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete unused volumes?', this.state.showPruneDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    const result: { result: { stdout: string; stderr: string } } =
                                        await this.props.socket.sendTo(
                                            `docker-manager.${this.props.instance}`,
                                            'volume:prune',
                                            {
                                                id: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        showPruneDialog: false,
                                        requesting: false,
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot prune volumes: ${e}`);
                                    alert(`Cannot prune volumes: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot prune volumes: ${e}`,
                                    });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <DeleteIcon />}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showPruneDialog: false })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        return (
            <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4 }}>
                {this.renderAddDialog()}
                {this.renderConfirmDialog()}
                {this.renderErrorDialog()}
                {this.renderSnackbar()}
                {this.renderConfirmPruneDialog()}
                {this.renderBrowseDialog()}
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.volumes"
                    iconPosition="top"
                >
                    {I18n.t('volume_explanation')
                        .split('\n')
                        .map((line, i) => (
                            <div key={i.toString()}>{line}</div>
                        ))}
                </InfoBox>
                <Table size="small">
                    <TableHead>
                        <TableRow style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                            <TableCell style={{ fontWeight: 'bold' }}>
                                <Tooltip
                                    title={I18n.t('Add new volume')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="primary"
                                        aria-label="add"
                                        style={{ marginRight: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showAddDialog: true,
                                                addVolumeName: '',
                                                addNetworkDriver: '',
                                            })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                {I18n.t('Name')}
                            </TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Driver')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Volume')}</TableCell>
                            <TableCell style={{ textAlign: 'right' }}>
                                <IconButton
                                    title={I18n.t('Prune unused containers')}
                                    disabled={!this.props.alive || this.state.requesting}
                                    onClick={() => this.setState({ showPruneDialog: true })}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.props.volumes?.map(volume => (
                            <TableRow key={volume.name}>
                                <TableCell
                                    style={{ fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={() => this.setState({ browseVolume: volume.name })}
                                >
                                    {volume.name}
                                </TableCell>
                                <TableCell>{volume.driver || '--'}</TableCell>
                                <TableCell>{volume.volume}</TableCell>
                                <TableCell style={{ textAlign: 'right' }}>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Delete volume')}
                                        disabled={this.state.requesting}
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: volume.name,
                                            })
                                        }
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        );
    }
}
