import React, { Component } from 'react';
import { type AdminConnection, I18n, InfoBox, type IobTheme, type ThemeType } from '@iobroker/gui-components';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fab,
    FormControl,
    IconButton,
    LinearProgress,
    Menu,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    PlayArrow,
    Pause,
    Warning as AlertIcon,
    Close as CloseIcon,
    Info as InfoIcon,
    ReceiptLong as LogsIcon,
    TextRotationNone as ExecuteIcon,
    Terminal as TerminalIcon,
    Stop,
} from '@mui/icons-material';
import type {
    ContainerInfo,
    DockerContainerInspect,
    ImageInfo,
    ContainerConfig,
    NetworkInfo,
} from '@iobroker/plugin-docker';
import CreateContainerDialog from '../Components/CreateContainer';
import ContainerTerminal from '../Components/ContainerTerminal';
import { mapInspectToConfig } from '../Components/utils';
import type { GUIResponseTerminal } from '../types';

interface ContainersTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    images: ImageInfo[] | undefined;
    containers: ContainerInfo[] | undefined;
    networks: NetworkInfo[] | undefined;
    container: { [id: string]: DockerContainerInspect };
    themeType: ThemeType;
    theme: IobTheme;
    onExecuteCommand: (
        containerId: string,
        command: string,
        cb: ((data: { stderr: string; stdout: string; code?: number | null }) => void) | null,
    ) => void;
    onTerminalStart: (containerId: string, shell: string, cb: (data: GUIResponseTerminal) => void) => void;
    onTerminalSend: (containerId: string, data: string) => void;
    onTerminalResize: (containerId: string, cols: number, rows: number) => void;
    onTerminalStop: (containerId: string) => void;
    removeSupported: boolean;
}

interface ContainersTabState {
    showAddDialog: boolean;
    requestingInspect: string;
    showAddComposeDialog: boolean;
    addCompose: string;
    logs: string[] | null;
    showDeleteDialog: string; // image name
    showPruneDialog: boolean;
    addImage: ContainerConfig | null;
    requesting: boolean;
    showRecreateDialog: string;
    showStopDialog: string;
    showRestartDialog: string;
    showError: string;
    showHint: string;
    dockerInspect?: DockerContainerInspect | null;
    showExecDialog: string;
    execCommand: string;
    execResults: { stderr: string; stdout: string };
    showTerminal: string; // container id
    terminalShell: string;
    showLinks: { anchorEl: HTMLElement | null; container: ContainerInfo } | null;
    instances: {
        [instance: string]: { alive: boolean; native: { [key: string]: any } | null; common?: ioBroker.InstanceCommon };
    };
}

export default class ContainersTab extends Component<ContainersTabProps, ContainersTabState> {
    private lastAddImage: ContainerConfig | null = null;
    private lastAddCompose = '';

    constructor(props: ContainersTabProps) {
        super(props);
        this.state = {
            logs: null,
            showAddDialog: false,
            showDeleteDialog: '',
            addCompose: '',
            showAddComposeDialog: false,
            addImage: null,
            requesting: false,
            requestingInspect: '',
            showRecreateDialog: '',
            showStopDialog: '',
            showRestartDialog: '',
            showError: '',
            showHint: '',
            dockerInspect: null,
            showExecDialog: '',
            execCommand: window.localStorage.getItem('exec') || '',
            execResults: { stderr: '', stdout: '' },
            showTerminal: '',
            terminalShell: window.localStorage.getItem('terminalShell') || '/bin/sh',
            showLinks: null,
            instances: {},
            showPruneDialog: false,
        };
    }

    componentDidMount(): void {
        this.props.onExecuteCommand(this.state.showExecDialog, this.state.execCommand, null);
    }

    async setStateAsync(state: Partial<ContainersTabState>): Promise<void> {
        return new Promise(resolve => this.setState(state as ContainersTabState, () => resolve()));
    }

    async triggerRecreateDialog(id: string): Promise<void> {
        const result: { result: DockerContainerInspect | null } = await this.props.socket.sendTo(
            `docker-manager.${this.props.instance}`,
            'container:inspect',
            {
                id,
            },
        );
        if (result?.result) {
            this.setState({ addImage: mapInspectToConfig(result.result), showRecreateDialog: id });
        } else {
            this.setState({
                showError: 'Cannot get information for container',
                showRecreateDialog: '',
            });
        }
    }

    renderAddDialog(): React.JSX.Element | null {
        if (!this.state.showAddDialog && !this.state.showRecreateDialog) {
            return null;
        }

        return (
            <CreateContainerDialog
                instance={this.props.instance}
                networks={this.props.networks || []}
                theme={this.props.theme}
                themeType={this.props.themeType}
                images={this.props.images}
                containers={this.props.containers || []}
                requesting={this.state.requesting}
                socket={this.props.socket}
                config={this.state.addImage || undefined}
                reCreateId={this.state.showRecreateDialog}
                onClose={(addImage, isRun?: boolean): void => {
                    if (!addImage) {
                        this.setState({ showAddDialog: false, showRecreateDialog: '' });
                        return;
                    }
                    this.lastAddImage = JSON.parse(JSON.stringify(addImage));
                    this.setState({ requesting: true }, async () => {
                        try {
                            if (this.state.showRecreateDialog) {
                                // remove old container
                                await this.props.socket.sendTo(
                                    `docker-manager.${this.props.instance}`,
                                    'container:remove',
                                    {
                                        id: this.state.showRecreateDialog,
                                    },
                                );
                            }

                            const result: { result: { stdout: string; stderr: string } } =
                                await this.props.socket.sendTo(
                                    `docker-manager.${this.props.instance}`,
                                    `container:${isRun ? 'run' : 'create'}`,
                                    addImage,
                                );
                            this.setState({
                                showAddDialog: false,
                                requesting: false,
                                showRecreateDialog: '',
                                showHint: result?.result.stdout || '',
                                showError: result?.result.stderr || '',
                            });
                        } catch (e) {
                            console.error(`Cannot create container image ${this.state.addImage!.name}: ${e}`);
                            alert(`Cannot pull image ${this.state.addImage!.name}: ${e}`);
                            this.setState({
                                requesting: false,
                                showError: `Cannot create container image ${this.state.addImage!.name}: ${e}`,
                            });
                        }
                    });
                }}
            />
        );
    }

    renderAddComposeDialog(): React.JSX.Element | null {
        if (!this.state.showAddComposeDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showAddComposeDialog: false })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>{I18n.t('Add container via docker-compose')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <Box>
                        {I18n.t('Please enter the docker-compose.yml content here:')}
                        <br />
                        {I18n.t('You can create multiple containers at once.')}
                    </Box>
                    <TextField
                        label="docker-compose.yml"
                        variant="filled"
                        multiline
                        minRows={10}
                        maxRows={30}
                        value={this.state.addCompose}
                        onChange={e => this.setState({ addCompose: e.target.value })}
                        fullWidth
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.addCompose || this.state.requesting}
                        onClick={() => {
                            this.lastAddCompose = this.state.addCompose;
                            this.setState({ requesting: true }, async () => {
                                try {
                                    const result: { result: { stdout: string; stderr: string } } =
                                        await this.props.socket.sendTo(
                                            `docker-manager.${this.props.instance}`,
                                            'container:create-compose',
                                            {
                                                compose: this.state.addCompose,
                                            },
                                        );
                                    this.setState({
                                        showAddComposeDialog: false,
                                        addCompose: '',
                                        requesting: false,
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot create container via docker-compose: ${e}`);
                                    alert(`Cannot create container via docker-compose: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot create container via docker-compose: ${e}`,
                                    });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Add')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showAddComposeDialog: false })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmDeleteDialog(): React.JSX.Element | null {
        if (!this.state.showDeleteDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showDeleteDialog: '' })}
            >
                <DialogTitle>{I18n.t('Delete container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete container "%s"?', this.state.showDeleteDialog)}
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
                                            'container:remove',
                                            {
                                                id: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        showDeleteDialog: '',
                                        requesting: false,
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot delete container ${this.state.showDeleteDialog}: ${e}`);
                                    alert(`Cannot delete image ${this.state.showDeleteDialog}: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot delete image ${this.state.showDeleteDialog}: ${e}`,
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

    renderConfirmPruneDialog(): React.JSX.Element | null {
        if (!this.state.showPruneDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showPruneDialog: false })}
            >
                <DialogTitle>{I18n.t('Prune unused containers')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete unused containers?', this.state.showPruneDialog)}
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
                                            'container:prune',
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
                                    console.error(`Cannot prune containers: ${e}`);
                                    alert(`Cannot prune containers: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot prune containers: ${e}`,
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

    renderConfirmStopDialog(): React.JSX.Element | null {
        if (!this.state.showStopDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showStopDialog: '' })}
            >
                <DialogTitle>{I18n.t('Stop container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to stop container "%s"?', this.state.showStopDialog)}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() =>
                            this.stopStartContainer(this.state.showStopDialog, false, () =>
                                this.setState({ showStopDialog: '' }),
                            )
                        }
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <Pause />}
                    >
                        {I18n.t('Stop')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showStopDialog: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmRestartDialog(): React.JSX.Element | null {
        if (!this.state.showRestartDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showRestartDialog: '' })}
            >
                <DialogTitle>{I18n.t('Restart container')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to restart container "%s"?', this.state.showRestartDialog)}
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
                                            'container:restart',
                                            {
                                                id: this.state.showRestartDialog,
                                            },
                                        );
                                    this.setState({
                                        showRestartDialog: '',
                                        requesting: false,
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                    });
                                } catch (e) {
                                    console.error(`Cannot restart container ${this.state.showRestartDialog}: ${e}`);
                                    alert(`Cannot restart image ${this.state.showRestartDialog}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <RefreshIcon />}
                    >
                        {I18n.t('Restart')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showRestartDialog: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    onAliveChanged = (id: string, state: ioBroker.State | null | undefined): void => {
        const instance = id.replace('system.adapter.', '').replace('.alive', '');
        const newInstances = { ...this.state.instances };
        if (newInstances[instance]) {
            if (newInstances[instance].alive !== !!state?.val) {
                newInstances[instance].alive = !!state?.val;
                this.setState({ instances: newInstances });
            }
        }
    };

    onInstanceChanged = async (id: string, obj: ioBroker.Object | null | undefined): Promise<void> => {
        const instance = id.replace('system.adapter.', '');
        if (this.state.instances[instance]) {
            if (obj) {
                // changed
                if (
                    JSON.stringify(obj.common) !== JSON.stringify(this.state.instances[instance].common) ||
                    JSON.stringify(obj.native) !== JSON.stringify(this.state.instances[instance].native)
                ) {
                    const newInstances = { ...this.state.instances };
                    newInstances[instance].native = obj.native;
                    newInstances[instance].common = obj.common as ioBroker.InstanceCommon;
                    this.setState({ instances: newInstances });
                }
            } else if (this.state.instances[instance].native !== null) {
                // deleted
                const newInstances = { ...this.state.instances };
                newInstances[instance].native = null;
                newInstances[instance].common = undefined;
                this.setState({ instances: newInstances });
                this.props.socket.unsubscribeState(`system.adapter.${instance}.alive`, this.onAliveChanged);
                await this.props.socket.unsubscribeObject(`system.adapter.${instance}`, this.onInstanceChanged);
            }
        } else if (obj) {
            // new instance created
            const newInstances = { ...this.state.instances };
            newInstances[instance].native = obj.native;
            newInstances[instance].common = obj.common as ioBroker.InstanceCommon;
            this.setState({ instances: newInstances });
            await this.props.socket.subscribeState(`system.adapter.${instance}.alive`, this.onAliveChanged);
            await this.props.socket.subscribeObject(`system.adapter.${instance}`, this.onInstanceChanged);
        }
    };

    async componentWillUnmount(): Promise<void> {
        // unsubscribe all
        for (const instance in this.state.instances) {
            if (
                Object.prototype.hasOwnProperty.call(this.state.instances, instance) &&
                this.state.instances[instance].common
            ) {
                this.props.socket.unsubscribeState(`system.adapter.${instance}.alive`, this.onAliveChanged);
                await this.props.socket.unsubscribeObject(`system.adapter.${instance}`, this.onInstanceChanged);
            }
        }
    }

    async componentDidUpdate(): Promise<void> {
        // collect instances
        const instances: `${string}.${number}`[] = [];
        this.props.containers?.forEach(c => {
            if (c.labels?.iobroker && !instances.includes(c.labels.iobroker as `${string}.${number}`)) {
                instances.push(c.labels.iobroker as `${string}.${number}`);
            }
        });
        instances.sort();

        let changed = false;
        const newInstances = { ...this.state.instances };
        for (const instance of instances) {
            if (!this.state.instances[instance]) {
                changed = true;
                // new instance found
                const obj = await this.props.socket.getObject(`system.adapter.${instance}`);
                if (!obj) {
                    newInstances[instance] = { alive: false, native: null };
                } else {
                    const alive = await this.props.socket.getState(`system.adapter.${instance}.alive`);
                    newInstances[instance] = {
                        alive: !!alive?.val,
                        native: obj.native,
                        common: obj.common,
                    };
                    await this.props.socket.subscribeState(`system.adapter.${instance}.alive`, this.onAliveChanged);
                    await this.props.socket.subscribeObject(`system.adapter.${instance}`, this.onInstanceChanged);
                }
            }
        }

        // go through all known instances and check if they still exist
        for (const instance in this.state.instances) {
            if (!instances.includes(instance as `${string}.${number}`)) {
                changed = true;
                // instance removed
                this.props.socket.unsubscribeState(`system.adapter.${instance}.alive`, this.onAliveChanged);
                await this.props.socket.unsubscribeObject(`system.adapter.${instance}`, this.onInstanceChanged);
                delete newInstances[instance];
            }
        }
        if (changed) {
            this.setState({ instances: newInstances });
        }
    }

    stopStartContainer(id: string, isStart: boolean, cb?: () => void): void {
        this.setState({ requesting: true }, async () => {
            try {
                const result: { result: { stdout: string; stderr: string } } = await this.props.socket.sendTo(
                    `docker-manager.${this.props.instance}`,
                    `container:${isStart ? 'start' : 'stop'}`,
                    {
                        id,
                    },
                );
                this.setState(
                    {
                        requesting: false,
                        showHint: result?.result.stdout || '',
                        showError: result?.result.stderr || '',
                    },
                    () => cb?.(),
                );
            } catch (e) {
                console.error(`Cannot ${isStart ? 'start' : 'stop'} container ${id}: ${e}`);
                alert(`Cannot ${isStart ? 'start' : 'stop'} container ${id}: ${e}`);
                this.setState({ requesting: false }, () => cb?.());
            }
        });
    }

    renderInspect(): React.JSX.Element | null {
        if (!this.state.dockerInspect) {
            return null;
        }

        const info = this.state.dockerInspect;

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ dockerInspect: null })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>{I18n.t('Image information')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <pre>{JSON.stringify(info, null, 2)}</pre>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ dockerInspect: null })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
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

    renderSnackbar(): React.JSX.Element {
        return (
            <Snackbar
                open={!!this.state.showHint}
                autoHideDuration={5000}
                onClose={() => this.setState({ showHint: '' })}
                message={this.state.showHint}
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

    executeCommand(): void {
        window.localStorage.setItem('exec', this.state.execCommand);

        this.setState({ requesting: true }, () => {
            this.props.onExecuteCommand(
                this.state.showExecDialog,
                this.state.execCommand,
                (result: { stdout: string; stderr: string; code?: number | null }): void => {
                    if (result.code !== undefined) {
                        this.setState({
                            requesting: false,
                            execResults: { stdout: result.stdout, stderr: result.stderr },
                        });
                    } else {
                        this.setState({ execResults: result || { stdout: '', stderr: '' } });
                    }
                },
            );
        });
    }

    stopCommandExecution(): void {
        this.props.onExecuteCommand(this.state.showExecDialog, this.state.execCommand, null);
        this.setState({ requesting: false });
    }

    renderExecDialog(): React.JSX.Element | null {
        if (!this.state.showExecDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => {
                    if (!this.state.requesting) {
                        this.setState({ showExecDialog: '', execCommand: '', execResults: { stdout: '', stderr: '' } });
                    }
                }}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>{I18n.t('Execute command inside container')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <TextField
                            label={I18n.t('Command')}
                            variant="standard"
                            autoFocus
                            onKeyUp={e => {
                                if (e.key === 'Enter' && this.state.execCommand && !this.state.requesting) {
                                    this.executeCommand();
                                }
                            }}
                            disabled={this.state.requesting}
                            fullWidth
                            value={this.state.execCommand}
                            onChange={e => this.setState({ execCommand: e.target.value })}
                        />
                        <Fab
                            color="secondary"
                            size="small"
                            disabled={!this.state.execCommand}
                            onClick={() => {
                                if (this.state.requesting) {
                                    this.stopCommandExecution();
                                } else {
                                    this.executeCommand();
                                }
                            }}
                        >
                            {this.state.requesting ? <Stop /> : <PlayArrow />}
                        </Fab>
                    </div>
                    {this.state.requesting ? <LinearProgress style={{ width: '100%' }} /> : null}
                    {this.state.execResults?.stdout ? (
                        <pre style={{ padding: 10, borderRadius: 5 }}>{this.state.execResults.stdout}</pre>
                    ) : null}
                    {this.state.execResults?.stderr ? (
                        <pre style={{ padding: 10, borderRadius: 5, color: 'red' }}>
                            {this.state.execResults.stderr}
                        </pre>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        disabled={this.state.requesting}
                        onClick={() =>
                            this.setState({
                                showExecDialog: '',
                                execCommand: '',
                                execResults: { stdout: '', stderr: '' },
                            })
                        }
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderTerminalDialog(): React.JSX.Element | null {
        if (!this.state.showTerminal) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showTerminal: '' })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {I18n.t('Terminal')}: {this.state.showTerminal}
                    </span>
                    <FormControl
                        variant="standard"
                        style={{ minWidth: 100, marginLeft: 'auto' }}
                    >
                        <Select
                            value={this.state.terminalShell}
                            onChange={e => {
                                window.localStorage.setItem('terminalShell', e.target.value);
                                this.setState({ terminalShell: e.target.value });
                            }}
                        >
                            <MenuItem value="/bin/sh">sh</MenuItem>
                            <MenuItem value="/bin/bash">bash</MenuItem>
                            <MenuItem value="/bin/ash">ash</MenuItem>
                        </Select>
                    </FormControl>
                </DialogTitle>
                <DialogContent style={{ height: '60vh', padding: 8 }}>
                    <ContainerTerminal
                        // remount (restart shell) when container or shell changes
                        key={`${this.state.showTerminal}_${this.state.terminalShell}`}
                        containerId={this.state.showTerminal}
                        shell={this.state.terminalShell}
                        themeType={this.props.themeType}
                        onTerminalStart={this.props.onTerminalStart}
                        onTerminalSend={this.props.onTerminalSend}
                        onTerminalResize={this.props.onTerminalResize}
                        onTerminalStop={this.props.onTerminalStop}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showTerminal: '' })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderLogs(): React.JSX.Element | null {
        if (!this.state.logs) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ logs: null })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>{I18n.t('Container logs')}</DialogTitle>
                <DialogContent style={{ display: 'flex', gap: 20, flexDirection: 'column' }}>
                    <pre>{this.state.logs.join('\n')}</pre>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ logs: null })}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderLinks(): React.JSX.Element {
        return (
            <Menu
                anchorEl={this.state.showLinks?.anchorEl}
                open={!!this.state.showLinks}
                onClose={() => this.setState({ showLinks: null })}
            >
                {this.state.showLinks?.container.httpLinks?.[window.location.hostname]?.map(link => (
                    <MenuItem
                        key={link}
                        sx={{
                            '& a:hover': { textDecoration: 'underline' },
                            '& a:visited': {
                                color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                            },
                            '& a:active': {
                                color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                            },
                        }}
                        onClick={() => this.setState({ showLinks: null })}
                    >
                        <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {link}
                        </a>
                    </MenuItem>
                ))}
            </Menu>
        );
    }

    getInstanceTooltip(container: ContainerInfo): string | null {
        if (container.labels?.iobroker) {
            const instance = this.state.instances[container.labels.iobroker as `${string}.${number}`];
            if (instance) {
                // not exist and should be removed
                if (!instance.common) {
                    return I18n.t(
                        'Instance %s does not exist anymore and the container should be removed',
                        container.labels.iobroker,
                    );
                }
                // exist but not enabled
                if (!instance.common?.enabled) {
                    if (container.status === 'running') {
                        return I18n.t(
                            'Instance %s is disabled, but container is still running',
                            container.labels.iobroker,
                        );
                    }
                    return I18n.t('Instance %s is not running', container.labels.iobroker);
                }
                if (instance.alive) {
                    if (container.status === 'running') {
                        return I18n.t('Instance %s is running', container.labels.iobroker);
                    }
                    return I18n.t('Instance %s is alive, but container is not running', container.labels.iobroker);
                }
                // exist, but not alive
                return I18n.t('Instance %s is stopped, but container is still running', container.labels.iobroker);
            }
            return I18n.t('Instance %s does not exist anymore and should be removed', container.labels.iobroker);
        }
        return null;
    }

    getInstanceColor(container: ContainerInfo): string {
        if (container.labels?.iobroker) {
            const instance = this.state.instances[container.labels.iobroker as `${string}.${number}`];
            if (instance) {
                // not exist and should be removed
                if (!instance.common) {
                    return 'red';
                }
                // exist but not enabled
                if (!instance.common?.enabled) {
                    if (container.status === 'running') {
                        return 'orange';
                    }
                    return 'grey';
                }
                if (instance.alive) {
                    if (container.status === 'running') {
                        return 'green';
                    }
                    return 'orange';
                }
                // exist, but not alive
                return 'orange';
            }
            return 'gray';
        }
        return 'inherit';
    }

    static getStatusColor(
        status: 'created' | 'restarting' | 'running' | 'removing' | 'paused' | 'exited' | 'dead',
    ): string {
        if (status === 'running' || status === 'created') {
            return 'green';
        }
        if (status === 'paused') {
            return 'blue';
        }
        if (status === 'restarting') {
            return 'orange';
        }
        if (status === 'exited' || status === 'dead') {
            return 'red';
        }
        return 'gray';
    }

    static upTime2String(minutes: number): string {
        if (minutes < 60) {
            return I18n.t('%s minutes', minutes);
        }
        const hours = Math.round(minutes / 6) / 10;
        if (hours < 24) {
            return I18n.t('%s hours', hours);
        }
        const days = Math.round(hours / 2.4) / 10;
        return I18n.t('%s days', days);
    }

    render(): React.JSX.Element {
        return (
            <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4 }}>
                {this.renderAddDialog()}
                {this.renderAddComposeDialog()}
                {this.renderConfirmDeleteDialog()}
                {this.renderConfirmPruneDialog()}
                {this.renderConfirmRestartDialog()}
                {this.renderConfirmStopDialog()}
                {this.renderErrorDialog()}
                {this.renderSnackbar()}
                {this.renderInspect()}
                {this.renderLogs()}
                {this.renderExecDialog()}
                {this.renderTerminalDialog()}
                {this.renderLinks()}
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.container"
                    iconPosition="top"
                >
                    {I18n.t('Container explanation')
                        .split('\n')
                        .map((line, i) => (
                            <div key={i.toString()}>{line}</div>
                        ))}
                </InfoBox>
                <Table
                    size="small"
                    sx={{ '& tbody td': { verticalAlign: 'top' } }}
                >
                    <TableHead>
                        <TableRow style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                            <TableCell>
                                <Tooltip
                                    title={I18n.t('Add new container')}
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
                                                addImage: this.lastAddImage || {
                                                    image:
                                                        this.props.images && this.props.images.length
                                                            ? `${this.props.images[0].repository}:${this.props.images[0].tag || 'latest'}`
                                                            : '',
                                                    name: '',
                                                },
                                            })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                <Tooltip
                                    title={I18n.t('Add new docker compose project')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="secondary"
                                        aria-label="add"
                                        style={{ marginRight: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({
                                                showAddComposeDialog: true,
                                                addCompose: this.lastAddCompose || '',
                                            })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                {I18n.t('ID')}
                            </TableCell>
                            <TableCell>
                                {I18n.t('Name')} / {I18n.t('Image')}
                            </TableCell>
                            <TableCell>{I18n.t('Created')}</TableCell>
                            <TableCell>{I18n.t('Status')}</TableCell>
                            <TableCell>{I18n.t('Ports')}</TableCell>
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
                        {this.props.containers?.map(container => (
                            <TableRow key={container.id}>
                                <TableCell title={this.getInstanceTooltip(container) || undefined}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div>{container.id || '--'}</div>
                                        <div
                                            style={{
                                                opacity: 0.7,
                                                fontSize: 'smaller',
                                                fontStyle: 'italic',
                                                color: this.getInstanceColor(container),
                                                height: 16.67,
                                            }}
                                        >
                                            {container.labels?.iobroker || ''}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div>{container.names || '--'}</div>
                                    <Box
                                        sx={{
                                            '& a:hover': { textDecoration: 'underline' },
                                            '& a:visited': {
                                                color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                                            },
                                            '& a:active': {
                                                color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                                            },
                                        }}
                                    >
                                        {container.image ? (
                                            <a
                                                href={`https://hub.docker.com/r/${container.image.split(':')[0]}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{
                                                    color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                                                }}
                                            >
                                                {container.image}
                                            </a>
                                        ) : (
                                            '--'
                                        )}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {container.createdAt
                                        ? new Date(container.createdAt.replace(/ [A-Z]+$/, '')).toLocaleString()
                                        : '--'}
                                </TableCell>
                                <TableCell>
                                    <div
                                        style={{
                                            color: ContainersTab.getStatusColor(container.status),
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        {container.status ? I18n.t(container.status) : '--'}
                                    </div>
                                    <div>
                                        {parseFloat(container.uptime).toString() === container.uptime
                                            ? ContainersTab.upTime2String(parseFloat(container.uptime))
                                            : container.uptime || '--'}
                                    </div>
                                </TableCell>
                                <TableCell
                                    title={
                                        container.httpLinks?.[window.location.hostname]?.length &&
                                        container.httpLinks[window.location.hostname].length > 1
                                            ? I18n.t('Click to open links')
                                            : undefined
                                    }
                                    style={{
                                        cursor: container.httpLinks?.[window.location.hostname]?.length
                                            ? 'pointer'
                                            : 'default',
                                        textDecoration: container.httpLinks?.[window.location.hostname]?.length
                                            ? 'underline'
                                            : 'none',
                                        color: container.httpLinks?.[window.location.hostname]?.length
                                            ? this.props.themeType === 'dark'
                                                ? '#4da6ff'
                                                : '#0066ff'
                                            : 'inherit',
                                    }}
                                    onClick={e => {
                                        const len = container.httpLinks?.[window.location.hostname]?.length;
                                        if (len && len > 1) {
                                            // show menu
                                            this.setState({ showLinks: { anchorEl: e.currentTarget, container } });
                                        } else if (len === 1) {
                                            // open link
                                            window.open(container.httpLinks![window.location.hostname][0], '_blank');
                                        }
                                    }}
                                >
                                    {container.ports.split(',').map((it, i) => (
                                        <div key={i.toString()}>{it.trim()}</div>
                                    ))}
                                </TableCell>
                                <TableCell style={{ textAlign: 'right' }}>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Logs')}
                                        disabled={
                                            !this.props.alive || this.state.requesting || !!this.state.requestingInspect
                                        }
                                        onClick={async () => {
                                            try {
                                                const result: { result: string[] | null } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'container:logs',
                                                        {
                                                            id: container.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    logs: result?.result,
                                                    showError: !result?.result ? 'Cannot get logs for container' : '',
                                                });
                                            } catch (e) {
                                                console.error(`Cannot get logs for container ${container.id}: ${e}`);
                                                alert(`Cannot get logs for container ${container.id}: ${e}`);
                                            }
                                        }}
                                    >
                                        <LogsIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Execute command in container')}
                                        disabled={
                                            !this.props.alive ||
                                            container.status !== 'running' ||
                                            this.state.requesting ||
                                            !!this.state.requestingInspect
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showExecDialog: container.id,
                                                execResults: { stderr: '', stdout: '' },
                                            })
                                        }
                                    >
                                        <ExecuteIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Open terminal')}
                                        disabled={
                                            !this.props.alive ||
                                            container.status !== 'running' ||
                                            this.state.requesting ||
                                            !!this.state.requestingInspect
                                        }
                                        onClick={() => this.setState({ showTerminal: container.id })}
                                    >
                                        <TerminalIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Information about container')}
                                        disabled={
                                            !this.props.alive || this.state.requesting || !!this.state.requestingInspect
                                        }
                                        onClick={async () => {
                                            try {
                                                await this.setStateAsync({ requestingInspect: container.id });
                                                const result: { result: DockerContainerInspect | null } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'container:inspect',
                                                        {
                                                            id: container.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    requestingInspect: '',
                                                    dockerInspect: result?.result,
                                                    showError: !result?.result
                                                        ? 'Cannot get information for container'
                                                        : '',
                                                });
                                            } catch (e) {
                                                console.error(
                                                    `Cannot get information for container ${container.id}: ${e}`,
                                                );
                                                alert(`Cannot get information for container ${container.id}: ${e}`);
                                            }
                                        }}
                                    >
                                        {this.state.requestingInspect === container.id ? (
                                            <CircularProgress size={18} />
                                        ) : (
                                            <InfoIcon />
                                        )}
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={
                                            container.status === 'running' || container.status === 'restarting'
                                                ? I18n.t('Stop container')
                                                : I18n.t('Start container')
                                        }
                                        disabled={!this.props.alive}
                                        onClick={() => {
                                            if (container.status !== 'running' && container.status !== 'restarting') {
                                                this.stopStartContainer(container.id, true);
                                            } else {
                                                this.setState({
                                                    showStopDialog: container.id,
                                                });
                                            }
                                        }}
                                    >
                                        {container.status === 'running' || container.status === 'restarting' ? (
                                            <Pause style={{ color: 'green' }} />
                                        ) : (
                                            <PlayArrow style={{ color: 'orange' }} />
                                        )}
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Restart container')}
                                        disabled={
                                            !this.props.alive ||
                                            (container.status !== 'running' && container.status !== 'restarting')
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showRestartDialog: container.id,
                                            })
                                        }
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Recreate container with new image')}
                                        disabled={!this.props.alive}
                                        onClick={() => this.triggerRecreateDialog(container.id)}
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    {this.props.removeSupported ? (
                                        <IconButton
                                            size="small"
                                            title={I18n.t('Delete container')}
                                            disabled={
                                                !this.props.alive ||
                                                container.status === 'running' ||
                                                container.status === 'restarting'
                                            }
                                            onClick={() =>
                                                this.setState({
                                                    showDeleteDialog: container.id,
                                                })
                                            }
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    ) : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        );
    }
}
