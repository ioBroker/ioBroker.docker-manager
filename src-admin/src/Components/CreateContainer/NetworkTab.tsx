import React from 'react';
import {
    Checkbox,
    FormControlLabel,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    MenuItem,
    TextField,
    IconButton,
    Select,
    TableFooter,
    InputLabel,
    FormControl,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';

import type { ContainerConfig, ContainerInfo, ImageInfo, NetworkInfo, PortBinding } from '@iobroker/plugin-docker';
import styles from './styles';

export function validateConfig(
    config: ContainerConfig,
    _images: ImageInfo[],
    _containers: ContainerInfo[] | null,
): string | null {
    // all container ports must be unique and not empty
    // all host ports must be unique (if set) and not empty
    if (config.publishAllPorts) {
        return null;
    }
    const containerPorts = new Set<number>();
    const hostPorts = new Set<number>();
    for (const port of config.ports || []) {
        if (!port.containerPort) {
            return I18n.t('Please enter a container port for all port mappings or enable "Publish all ports"');
        }
        const containerPort = parseInt(port.containerPort.toString(), 10);
        if (isNaN(containerPort) || containerPort <= 0 || containerPort > 65535) {
            return I18n.t('Please enter a valid container port (1-65535)');
        }
        if (containerPorts.has(containerPort)) {
            return I18n.t('Container ports must be unique');
        }
        containerPorts.add(containerPort);

        if (port.hostPort) {
            const hostPort = parseInt(port.hostPort.toString(), 10);
            if (isNaN(hostPort) || hostPort <= 0 || hostPort > 65535) {
                return I18n.t('Please enter a valid host port (1-65535)');
            }
            if (hostPorts.has(hostPort)) {
                return I18n.t('Host ports must be unique');
            }
            hostPorts.add(hostPort);
        }
    }

    return null;
}

export default function NetworkTab(props: {
    containers: ContainerInfo[] | null;
    networks: NetworkInfo[] | null;
    config: ContainerConfig;
    requesting: boolean;
    onChange: (config: ContainerConfig) => void;
}): React.JSX.Element {
    const error = validateConfig(props.config, [], props.containers);
    return (
        <div style={styles.tab}>
            <div style={{ width: '100%' }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            disabled={props.requesting}
                            checked={!!props.config.publishAllPorts}
                            onClick={() =>
                                props.onChange({
                                    ...props.config,
                                    publishAllPorts: !props.config?.publishAllPorts,
                                })
                            }
                        />
                    }
                    label={I18n.t('Publish all ports')}
                />
                <div>
                    {I18n.t(
                        'If activated, all exposed ports of the container will be published to random ports on the host',
                    )}
                </div>
            </div>
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>{I18n.t('Network mode')}</InputLabel>
                <Select
                    disabled={props.requesting}
                    variant="standard"
                    value={props.config?.networkMode || 'bridge'}
                    onChange={e =>
                        props.onChange({
                            ...props.config,
                            image: e.target.value as string,
                        })
                    }
                >
                    <MenuItem
                        value="bridge"
                        key="bridge"
                    >
                        {I18n.t('Bridge (default)')}
                    </MenuItem>
                    <MenuItem
                        value="host"
                        key="host"
                    >
                        {I18n.t('Host')}
                    </MenuItem>
                    <MenuItem
                        value="none"
                        key="none"
                    >
                        {I18n.t('None')}
                    </MenuItem>
                    <MenuItem
                        value="macvlan"
                        key="macvlan"
                    >
                        macvlan
                    </MenuItem>
                    <MenuItem
                        value="overlay"
                        key="overlay"
                    >
                        Overlay
                    </MenuItem>
                    {props.containers?.map(c => (
                        <MenuItem
                            value={`container:${c.id}`}
                            key={c.id}
                        >
                            {I18n.t('container')}:{c.names}
                        </MenuItem>
                    ))}
                    {props.networks
                        ?.filter(n => !['bridge', 'host', 'none'].includes(n.name))
                        .map(n => (
                            <MenuItem
                                value={n.name}
                                key={n.id}
                            >
                                {n.name}
                            </MenuItem>
                        ))}
                </Select>
            </FormControl>
            {!props.config.publishAllPorts ? (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{I18n.t('Container port')}</TableCell>
                            <TableCell>{I18n.t('Host port')}</TableCell>
                            <TableCell>{I18n.t('Protocol')}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(props.config.ports || []).map((port, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <TextField
                                        fullWidth
                                        variant="standard"
                                        type="number"
                                        value={port.containerPort || ''}
                                        onChange={e => {
                                            const newPorts = [...(props.config.ports || [])];
                                            newPorts[index] = {
                                                ...newPorts[index],
                                                containerPort: e.target.value,
                                            };
                                            props.onChange({ ...props.config, ports: newPorts });
                                        }}
                                        disabled={props.requesting}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        fullWidth
                                        variant="standard"
                                        type="number"
                                        value={port.hostPort || ''}
                                        onFocus={() => {
                                            if (!port.hostPort && port.containerPort) {
                                                const newPorts = [...(props.config.ports || [])];
                                                newPorts[index] = { ...newPorts[index], hostPort: port.containerPort };
                                                props.onChange({ ...props.config, ports: newPorts });
                                            }
                                        }}
                                        onChange={e => {
                                            const newPorts = [...(props.config.ports || [])];
                                            newPorts[index] = {
                                                ...newPorts[index],
                                                hostPort: parseInt(e.target.value, 10) || undefined,
                                            };
                                            props.onChange({ ...props.config, ports: newPorts });
                                        }}
                                        disabled={props.requesting}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Select
                                        fullWidth
                                        variant="standard"
                                        value={port.protocol || 'tcp'}
                                        onChange={e => {
                                            const newPorts = [...(props.config.ports || [])];
                                            newPorts[index] = {
                                                ...newPorts[index],
                                                protocol: e.target.value,
                                            };
                                            props.onChange({ ...props.config, ports: newPorts });
                                        }}
                                        disabled={props.requesting}
                                    >
                                        <MenuItem value="tcp">TCP</MenuItem>
                                        <MenuItem value="udp">UDP</MenuItem>
                                        <MenuItem value="sctp">SCTP</MenuItem>
                                    </Select>
                                </TableCell>
                                {/*<TableCell>
                                    <TextField
                                        fullWidth
                                        variant="standard"
                                        value={port.comment || ''}
                                        onChange={e => {
                                            const newPorts = [...(props.config.ports || [])];
                                            newPorts[index] = { ...newPorts[index], comment: e.target.value };
                                            props.onChange({ ...props.config, ports: newPorts });
                                        }}
                                        disabled={props.requesting}
                                    />
                                </TableCell>*/}
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            const newPorts = [...(props.config.ports || [])];
                                            newPorts.splice(index, 1);
                                            props.onChange({ ...props.config, ports: newPorts });
                                        }}
                                        disabled={props.requesting}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        const newPorts: PortBinding[] = [
                                            ...(props.config.ports || []),
                                            {
                                                containerPort: '',
                                                hostPort: '',
                                                protocol: 'tcp',
                                            },
                                        ];
                                        props.onChange({ ...props.config, ports: newPorts });
                                    }}
                                    disabled={props.requesting}
                                    startIcon={<AddIcon />}
                                >
                                    {I18n.t('Add port mapping')}
                                </Button>
                                {error ? <div style={{ color: 'red' }}>{error}</div> : null}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            ) : null}
        </div>
    );
}
