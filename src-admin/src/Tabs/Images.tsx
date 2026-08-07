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
    Autocomplete,
    InputLabel,
    Select,
    MenuItem,
    FormControl,
} from '@mui/material';

import { type AdminConnection, I18n, InfoBox, type ThemeType } from '@iobroker/adapter-react-v5';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Warning as AlertIcon,
    Close as CloseIcon,
    Info as InfoIcon,
} from '@mui/icons-material';

import type { ContainerInfo, ImageInfo, DockerImageInspect, DockerImageTagsResponse } from '@iobroker/plugin-docker';
import { size2string } from '../Components/utils';

interface ImagesTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    images: ImageInfo[] | undefined;
    containers: ContainerInfo[] | undefined;
    themeType: ThemeType;
    removeSupported: boolean;
}

interface ImagesTabState {
    showAddDialog: boolean;
    showDeleteDialog: string;
    showPruneDialog: boolean;
    addImageName: string;
    addImageTag: string;
    requesting: boolean;
    showHint: string;
    showError: string;
    dockerInspect: DockerImageInspect | null;
    imagesTags: Record<string, DockerImageTagsResponse['results'] | null>;
    imageAutocomplete: {
        [text: string]: { name: string; description: string; isOfficial: boolean; starCount: number }[];
    };
}

export default class ImagesTab extends Component<ImagesTabProps, ImagesTabState> {
    private autoCompleteTimer?: ReturnType<typeof setTimeout>;

    constructor(props: ImagesTabProps) {
        super(props);
        this.state = {
            showAddDialog: false,
            showDeleteDialog: '',
            addImageName: '',
            addImageTag: '',
            requesting: false,
            showHint: '',
            showError: '',
            dockerInspect: null,
            imagesTags: {},
            imageAutocomplete: {},
            showPruneDialog: false,
        };
    }

    componentDidMount(): void {
        if (this.autoCompleteTimer) {
            clearTimeout(this.autoCompleteTimer);
            this.autoCompleteTimer = undefined;
        }
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
                <DialogTitle>{I18n.t('Pull new image')}</DialogTitle>
                <DialogContent>
                    <Autocomplete
                        fullWidth
                        disablePortal
                        autoFocus
                        options={this.state.imageAutocomplete[this.state.addImageName] || []}
                        renderInput={params => (
                            <TextField
                                {...params}
                                disabled={this.state.requesting}
                                variant="standard"
                                label={I18n.t('Image name')}
                            />
                        )}
                        renderOption={(props, option) => (
                            <li
                                {...props}
                                key={option.name}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: 4,
                                }}
                            >
                                <div style={{ position: 'relative' }}>
                                    {option.isOfficial ? (
                                        <Tooltip
                                            title={I18n.t('Official image')}
                                            slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                        >
                                            <InfoIcon
                                                style={{ color: 'green', position: 'absolute', top: 0, right: 0 }}
                                            />
                                        </Tooltip>
                                    ) : null}
                                    <span>{option.name}</span>
                                    {option.starCount ? ` (${option.starCount} ★)` : ''}
                                </div>
                                <div style={{ fontSize: 'smaller', opacity: 0.7, fontStyle: 'italic' }}>
                                    {option.description}
                                </div>
                            </li>
                        )}
                        slotProps={{
                            listbox: { style: { overflow: 'auto' } },
                        }}
                        noOptionsText={I18n.t('No images found')}
                        loadingText={I18n.t('Loading...')}
                        getOptionLabel={option => (typeof option === 'object' ? option.name : option)}
                        onInputChange={(_, value, reason) => {
                            if (reason === 'input') {
                                this.setState({ addImageName: value });
                                void this.autocompleteImageName(value);
                            }
                        }}
                        onChange={(_, value) => {
                            this.setState({
                                addImageName: value ? (typeof value === 'object' ? value.name : value) : '',
                            });
                            if (typeof value === 'object' && value) {
                                void this.readImageTags(value.name).then(tags =>
                                    this.setState({
                                        imagesTags: { ...this.state.imagesTags, [value.name]: tags },
                                    }),
                                );
                            }
                        }}
                        value={
                            this.state.imageAutocomplete[this.state.addImageName]?.find(
                                item => item.name === this.state.addImageName,
                            ) || null
                        }
                        freeSolo
                    />
                    {this.state.addImageName ? (
                        <FormControl
                            fullWidth
                            variant="standard"
                        >
                            <InputLabel>{I18n.t('Image tag')}</InputLabel>
                            <Select
                                disabled={this.state.requesting}
                                variant="standard"
                                value={this.state.addImageTag || ''}
                                onChange={e => this.setState({ addImageTag: e.target.value })}
                            >
                                {!this.state.imagesTags[this.state.addImageName]?.find(it => it.name === 'latest') ? (
                                    <MenuItem value="latest">latest</MenuItem>
                                ) : null}
                                {this.state.imagesTags[this.state.addImageName]?.map(tag => (
                                    <MenuItem
                                        key={tag.name}
                                        value={tag.name}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                                    >
                                        <div style={{ fontWeight: 'bold' }}>{tag.name}</div>
                                        <div style={{ fontSize: 'smaller', opacity: 0.7, fontStyle: 'italic' }}>
                                            {I18n.t('updated')}: {new Date(tag.last_updated).toLocaleString()}
                                        </div>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.requesting}
                        onClick={() => {
                            this.setState({ requesting: true }, async () => {
                                try {
                                    await this.props.socket.sendTo(
                                        `docker-manager.${this.props.instance}`,
                                        'image:pull',
                                        {
                                            image: `${this.state.addImageName}:${this.state.addImageTag}`,
                                        },
                                    );
                                    this.setState({ showAddDialog: false, requesting: false });
                                } catch (e) {
                                    console.error(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                    alert(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                    this.setState({ requesting: false });
                                }
                            });
                        }}
                        startIcon={this.state.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Pull')}
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
                <DialogTitle>{I18n.t('Remove image')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete image "%s"?', this.state.showDeleteDialog)}
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
                                            'image:remove',
                                            {
                                                image: this.state.showDeleteDialog,
                                            },
                                        );
                                    this.setState({
                                        showDeleteDialog: '',
                                        showHint: result?.result.stdout || '',
                                        showError: result?.result.stderr || '',
                                        requesting: false,
                                    });
                                } catch (e) {
                                    console.error(`Cannot delete image ${this.state.showDeleteDialog}: ${e}`);
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

    async readImageTags(image: string): Promise<DockerImageTagsResponse['results'] | null> {
        const result: {
            result: DockerImageTagsResponse['results'];
        } = await this.props.socket.sendTo(`docker-manager.${this.props.instance}`, 'image:tags', {
            image,
        });
        return result?.result || null;
    }

    autocompleteImageName(imagePart: string): void {
        if (this.autoCompleteTimer) {
            clearTimeout(this.autoCompleteTimer);
        }

        this.autoCompleteTimer = setTimeout(async () => {
            this.autoCompleteTimer = undefined;

            const autoComplete: {
                result: {
                    name: string;
                    description: string;
                    isOfficial: boolean;
                    starCount: number;
                }[];
            } = await this.props.socket.sendTo(`docker-manager.${this.props.instance}`, 'image:autocomplete', {
                image: imagePart,
            });

            if (autoComplete.result) {
                this.setState({
                    imageAutocomplete: {
                        ...this.state.imageAutocomplete,
                        [imagePart]: autoComplete ? autoComplete.result : [],
                    },
                });
            }
        }, 300);
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

    renderConfirmPruneDialog(): React.JSX.Element | null {
        if (!this.state.showPruneDialog) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showPruneDialog: false })}
            >
                <DialogTitle>{I18n.t('Prune unused images')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Are you sure you want to delete unused images?', this.state.showPruneDialog)}
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
                                            'image:prune',
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
                                    console.error(`Cannot prune images: ${e}`);
                                    alert(`Cannot prune images: ${e}`);
                                    this.setState({
                                        requesting: false,
                                        showError: `Cannot prune images: ${e}`,
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
                {this.renderInspect()}
                {this.renderConfirmPruneDialog()}
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.image"
                    iconPosition="top"
                >
                    {I18n.t('Image explanation')
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
                                    title={I18n.t('Add new image')}
                                    slotProps={{ popper: { sx: { pointerEvents: 'none' } } }}
                                >
                                    <Fab
                                        size="small"
                                        color="primary"
                                        aria-label="add"
                                        style={{ marginRight: 10 }}
                                        disabled={!this.props.alive}
                                        onClick={() =>
                                            this.setState({ showAddDialog: true, addImageName: '', addImageTag: '' })
                                        }
                                    >
                                        <AddIcon />
                                    </Fab>
                                </Tooltip>
                                {I18n.t('Repository')}
                            </TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Tag')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Image ID')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Created')}</TableCell>
                            <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Size')}</TableCell>
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
                        {this.props.images?.map(image => (
                            <TableRow key={image.id}>
                                <TableCell
                                    style={{ fontWeight: 'bold', fontSize: '1rem' }}
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
                                    {image.repository ? (
                                        <a
                                            href={`https://hub.docker.com/r/${image.repository}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                color: this.props.themeType === 'dark' ? '#4da6ff' : '#0066ff',
                                            }}
                                        >
                                            {image.repository}
                                        </a>
                                    ) : (
                                        '--'
                                    )}
                                </TableCell>
                                <TableCell style={{ fontStyle: 'italic' }}>{image.tag || '--'}</TableCell>
                                <TableCell>{image.id || '--'}</TableCell>
                                <TableCell>
                                    {image.createdSince
                                        ? new Date(image.createdSince.replace(/ [A-Z]+$/, '')).toLocaleString()
                                        : '--'}
                                </TableCell>
                                <TableCell>{size2string(image.size)}</TableCell>
                                <TableCell style={{ textAlign: 'right' }}>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Information about image')}
                                        disabled={!this.props.alive}
                                        onClick={async () => {
                                            try {
                                                const result: { result: DockerImageInspect | null } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'image:inspect',
                                                        {
                                                            image: image.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    dockerInspect: result?.result,
                                                    showError: !result?.result
                                                        ? 'Cannot get information for image'
                                                        : '',
                                                });
                                            } catch (e) {
                                                console.error(`Cannot get information for image ${image.id}: ${e}`);
                                                alert(`Cannot get information for image ${image.id}: ${e}`);
                                            }
                                        }}
                                    >
                                        <InfoIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Pull latest version of image')}
                                        disabled={!this.props.alive || !image.tag || image.tag === '<none>'}
                                        onClick={async () => {
                                            try {
                                                const result: { result: { stdout: string; stderr: string } } =
                                                    await this.props.socket.sendTo(
                                                        `docker-manager.${this.props.instance}`,
                                                        'image:pull',
                                                        {
                                                            image: image.id,
                                                        },
                                                    );
                                                this.setState({
                                                    showAddDialog: false,
                                                    showHint: result?.result.stdout || '',
                                                    showError: result?.result.stderr || '',
                                                });
                                            } catch (e) {
                                                console.error(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                                alert(`Cannot pull image ${this.state.addImageName}: ${e}`);
                                            }
                                        }}
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        title={I18n.t('Delete image')}
                                        disabled={
                                            !this.props.alive ||
                                            this.props.containers?.some(
                                                c => c.image === `${image.repository}:${image.tag}`,
                                            )
                                        }
                                        onClick={() =>
                                            this.setState({
                                                showDeleteDialog: image.id,
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
