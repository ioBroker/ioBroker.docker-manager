import React, { Component } from 'react';
import { Paper, TextField, InputLabel, Select, MenuItem, FormControl, Checkbox, FormControlLabel } from '@mui/material';

import { type AdminConnection, I18n, InfoBox } from '@iobroker/gui-components';

import type { DockerManagerAdapterConfig } from '../types';

interface OptionsTabProps {
    socket: AdminConnection;
    native: DockerManagerAdapterConfig;
    onChange: (attr: string, value: boolean | string) => Promise<void>;
}

export default class OptionsTab extends Component<OptionsTabProps, object> {
    render(): React.JSX.Element {
        return (
            <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4 }}>
                <InfoBox
                    type="info"
                    closeable
                    storeId="docker-manager.dockerUrl"
                    iconPosition="top"
                >
                    {I18n.t('dockerUrl_explanation')
                        .split('\n')
                        .map((line, i) => (
                            <div key={i.toString()}>{line}</div>
                        ))}
                </InfoBox>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!!this.props.native.dockerApi}
                                onClick={() => this.props.onChange('dockerApi', !this.props.native.dockerApi)}
                            />
                        }
                        label={I18n.t('Manage docker via API')}
                    />
                    {this.props.native.dockerApi ? (
                        <div>
                            <FormControl
                                style={{
                                    width: '100%',
                                    maxWidth: 80,
                                    marginRight: 10,
                                }}
                                variant="standard"
                            >
                                <InputLabel>{I18n.t('Protocol')}</InputLabel>
                                <Select
                                    variant="standard"
                                    value={this.props.native.protocol || 'http'}
                                    onChange={e => this.props.onChange('protocol', e.target.value)}
                                >
                                    <MenuItem value="http">http</MenuItem>
                                    <MenuItem value="https">https</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                label={I18n.t('Docker API Host')}
                                style={{
                                    width: '100%',
                                    maxWidth: 200,
                                    marginRight: 10,
                                }}
                                variant="standard"
                                value={this.props.native.host}
                                onChange={e => this.props.onChange('host', e.target.value)}
                                helperText={I18n.t('Like 192.168.1.10')}
                            />
                            <TextField
                                label={I18n.t('Port')}
                                style={{
                                    width: '100%',
                                    maxWidth: 100,
                                    marginRight: 10,
                                }}
                                type="number"
                                slotProps={{
                                    htmlInput: {
                                        min: 1,
                                        max: 0xffff,
                                    },
                                }}
                                variant="standard"
                                value={this.props.native.port}
                                onChange={e => this.props.onChange('port', e.target.value)}
                            />
                        </div>
                    ) : null}
                </div>
            </Paper>
        );
    }
}
