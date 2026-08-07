import React, { Component } from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';

import { type AdminConnection, I18n, type IobTheme, type ThemeType } from '@iobroker/gui-components';

import type { ContainerConfig, ContainerInfo, ImageInfo, NetworkInfo } from '@iobroker/plugin-docker';
import MainTab, { validateConfig as validateConfigMain } from './MainTab';
import NetworkTab, { validateConfig as validateConfigNetwork } from './NetworkTab';
import VolumeTab, { validateConfig as validateConfigVolume } from './VolumeTab';
import EnvironmentTab, { validateConfig as validateConfigEnvironment } from './EnvironmentTab';
import SecurityTab, { validateConfig as validateConfigSecurity } from './SecurityTab';

interface CreateContainerDialogProps {
    images: ImageInfo[] | undefined;
    containers: ContainerInfo[];
    networks: NetworkInfo[];
    config?: ContainerConfig;
    onClose: (config?: ContainerConfig, isRun?: boolean) => void;
    requesting: boolean;
    themeType: ThemeType;
    socket: AdminConnection;
    theme: IobTheme;
    instance: number;
    reCreateId?: string;
}

interface CreateContainerDialogState {
    addImageTab: 'main' | 'security' | 'volume' | 'network' | 'environment';
    config: ContainerConfig;
    isNewContainer: boolean;
    images: ImageInfo[] | undefined;
}

export default class CreateContainerDialog extends Component<CreateContainerDialogProps, CreateContainerDialogState> {
    constructor(props: CreateContainerDialogProps) {
        super(props);
        this.state = {
            addImageTab: 'main',
            config: this.props.config || { name: '', image: '' },
            isNewContainer: !this.props.config,
            images: this.props.images,
        };
    }

    async componentDidMount(): Promise<void> {
        if (!this.state.images) {
            // request images
            const result: { result: ImageInfo[] } = await this.props.socket.sendTo(
                `docker-manager.${this.props.instance}`,
                'image:list',
                '',
            );
            if (result?.result) {
                this.setState({ images: result.result });
            }
        }
    }

    render(): React.JSX.Element {
        const validateErrorMain = validateConfigMain(
            this.state.config,
            this.state.images || [],
            this.props.containers,
            this.props.reCreateId,
        );
        const validateErrorNetwork = validateConfigNetwork(
            this.state.config,
            this.state.images || [],
            this.props.containers,
        );
        const validateErrorVolume = validateConfigVolume(
            this.state.config,
            this.state.images || [],
            this.props.containers,
        );
        const validateErrorEnvironment = validateConfigEnvironment(
            this.state.config,
            this.state.images || [],
            this.props.containers,
        );
        const validateErrorSecurity = validateConfigSecurity(
            this.state.config,
            this.state.images || [],
            this.props.containers,
        );

        return (
            <Dialog
                open={!0}
                onClose={() => this.props.onClose()}
                maxWidth="lg"
                fullWidth
                sx={{
                    // make the dialog full height
                    '& .MuiDialog-paper': {
                        height: 'calc(100% - 64px)',
                        maxHeight: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                    },
                }}
            >
                <DialogTitle>{I18n.t('Create new container')}</DialogTitle>
                <DialogContent
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 400,
                        height: '100%',
                        overflow: 'hidden',
                    }}
                >
                    <Tabs
                        value={this.state.addImageTab}
                        onChange={(_, v) => this.setState({ addImageTab: v })}
                        style={{ backgroundColor: this.props.themeType === 'dark' ? '#333' : '#fff' }}
                    >
                        <Tab
                            value="main"
                            style={{ color: validateErrorMain ? 'red' : undefined }}
                            label={I18n.t('Main')}
                        />
                        <Tab
                            style={{ color: validateErrorNetwork ? 'red' : undefined }}
                            value="network"
                            label={I18n.t('Network')}
                        />
                        <Tab
                            style={{ color: validateErrorVolume ? 'red' : undefined }}
                            value="volume"
                            label={I18n.t('Volume')}
                        />
                        <Tab
                            style={{ color: validateErrorEnvironment ? 'red' : undefined }}
                            value="environment"
                            label={I18n.t('Environment')}
                        />
                        <Tab
                            style={{ color: validateErrorSecurity ? 'red' : undefined }}
                            value="security"
                            label={I18n.t('Security')}
                        />
                    </Tabs>
                    <div style={{ height: 'calc(100% - 48px)', overflow: 'hidden' }}>
                        {this.state.addImageTab === 'main' ? (
                            <MainTab
                                reCreateId={this.props.reCreateId}
                                containers={this.props.containers}
                                images={this.state.images || []}
                                config={this.state.config}
                                requesting={!!this.props.requesting}
                                onChange={config => this.setState({ config })}
                            />
                        ) : null}
                        {this.state.addImageTab === 'network' ? (
                            <NetworkTab
                                containers={this.props.containers}
                                networks={this.props.networks}
                                config={this.state.config}
                                requesting={!!this.props.requesting}
                                onChange={config => this.setState({ config })}
                            />
                        ) : null}
                        {this.state.addImageTab === 'volume' ? (
                            <VolumeTab
                                containers={this.props.containers}
                                config={this.state.config}
                                requesting={!!this.props.requesting}
                                onChange={config => this.setState({ config })}
                            />
                        ) : null}
                        {this.state.addImageTab === 'security' ? (
                            <SecurityTab
                                config={this.state.config}
                                requesting={!!this.props.requesting}
                                onChange={config => this.setState({ config })}
                                theme={this.props.theme}
                            />
                        ) : null}
                        {this.state.addImageTab === 'environment' ? (
                            <EnvironmentTab
                                config={this.state.config}
                                requesting={!!this.props.requesting}
                                onChange={config => this.setState({ config })}
                            />
                        ) : null}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button
                        disabled={
                            !this.state.config.image ||
                            !this.state.config.name ||
                            this.props.requesting ||
                            !!validateErrorMain ||
                            !!validateErrorNetwork ||
                            !!validateErrorVolume
                        }
                        variant="contained"
                        color="primary"
                        onClick={() => this.props.onClose(this.state.config, true)}
                        startIcon={this.props.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Create and run')}
                    </Button>
                    <Button
                        disabled={
                            !this.state.config.image ||
                            !this.state.config.name ||
                            this.props.requesting ||
                            !!validateErrorMain ||
                            !!validateErrorNetwork ||
                            !!validateErrorVolume
                        }
                        variant="contained"
                        color="primary"
                        onClick={() => this.props.onClose(this.state.config)}
                        startIcon={this.props.requesting ? <CircularProgress size={24} /> : <AddIcon />}
                    >
                        {I18n.t('Create')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.props.onClose()}
                        startIcon={<CloseIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
