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

import type { NetworkInfo, NetworkDriver } from '@iobroker/plugin-docker';

interface NetworksTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    networks: NetworkInfo[] | undefined;
    removeSupported: boolean;
}

interface NetworksTabState {
    showAddDialog: boolean;
    showDeleteDialog: string;
    showPruneDialog: boolean;
    addNetworkName: string;
    addNetworkDriver: NetworkDriver | '';
    requesting: boolean;
    showHint: string;
    showError: string;
}

export default class NetworksTab extends Component<NetworksTabProps, NetworksTabState> {
    constructor(props: NetworksTabProps) {
        super(props);
        this.state = {
            showAddDialog: false,
            showDeleteDialog: '',
            addNetworkName: '',
            addNetworkDriver: '',
            requesting: false,
            showHint: '',
            showError: '',
            showPruneDialog: false,
        };
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
                <DialogTitle>{I18n.t('Create new network')}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        value={this.state.addNetworkName}
                        onChange={e => this.setState({ addNetworkName: e.target.value })}
                        label={I18n.t('Network name')}
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
                            <MenuItem value="bridge">bridge</MenuItem>
                            <MenuItem value="host">host</MenuItem>
                            <MenuItem value="overlay">overlay</MenuItem>
                            <MenuItem value="macvlan">macvlan</MenuItem>
                            <MenuItem value="none">none</MenuItem>
                            <MenuItem value="container">container</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={
                            this.state.requesting ||
                            !this.state.addNetworkName.trim() ||
                            !!this.props.networks?.find(net => net.name === this.state.addNetworkName.trim())
                        }
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'network:create',
                                        {
                                            name: this.state.addNetworkName,
                                            driver: this.state.addNetworkDriver || undefined,
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
                <DialogTitle>{I18n.t('Remove network')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete network "%s"?', this.state.showDeleteDialog)}
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
                                            'network:remove',
                                            {
                                                id: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        requesting: false,
                                        showDeleteDialog: '',
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot delete network ${this.state.showDeleteDialog}: ${e}`);
                                    alert(`Cannot delete network ${this.state.showDeleteDialog}: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot delete network ${this.state.showDeleteDialog}: ${e}`,
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
                <DialogTitle>{I18n.t('Prune unused networks')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete unused networks?', this.state.showPruneDialog)}
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
                                            'network:prune',
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
                                    console.error(`Cannot prune networks: ${e}`);
                                    alert(`Cannot prune networks: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot prune networks: ${e}`,
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
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.network"
                    iconPosition="top"
                >
                    {I18n.t('network_explanation')
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
                                    title={I18n.t('Add new network')}
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
                                                addNetworkName: '',
                                                addNetworkDriver: '',
                                            })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                {I18n.t('Name')}
                            </TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('ID')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Driver')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Scope')}</TableCell>
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
                        {this.props.networks?.map(network => (
                            <TableRow key={network.id}>
                                <TableCell style={{ fontWeight: 'bold' }}>{network.name}</TableCell>
                                <TableCell style={{ fontSize: 'smaller' }}>{network.id}</TableCell>
                                <TableCell>{network.driver || '--'}</TableCell>
                                <TableCell>{network.scope}</TableCell>
                                <TableCell style={{ textAlign: 'right' }}>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Delete network')}
                                        disabled={
                                            !this.props.alive ||
                                            network.name === 'host' ||
                                            network.name === 'bridge' ||
                                            network.name === 'none'
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: network.id,
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
