import React from 'react';
import {
    Checkbox,
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
    FormControl,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';

import type { ContainerConfig, ContainerInfo, ImageInfo, VolumeMount } from '@iobroker/plugin-docker';
import styles from './styles';

export function validateConfig(
    config: ContainerConfig,
    _images: ImageInfo[],
    _containers: ContainerInfo[] | null,
): string | null {
    // sources can be empty for volumes, but targets not
    // tmpfs and npipe should have empty source
    // npipe source should be a valid Windows pipe path
    // tmpfs source should be empty
    // bind source should be a valid path
    // volume source should be a valid name (alphanumeric, -, _ and .)
    // readOnly is optional
    // type is one of bind, volume, tmpfs, npipe

    if (!config.mounts) {
        return null;
    }
    for (let i = 0; i < config.mounts.length; i++) {
        const mount = config.mounts[i];
        if (!mount.target) {
            return I18n.t('Please enter a container path for all mounts');
        }
        if (!mount.type) {
            return I18n.t('Please select a mount type for all mounts');
        }
        if (mount.type === 'bind') {
            if (!mount.source) {
                return I18n.t('Please enter a host path for all bind mounts');
            }
            // We cannot validate the path more, because it can be different on different systems
        } else if (mount.type === 'volume') {
            if (!mount.source) {
                return I18n.t('Please enter a volume name for all volume mounts');
            }
            if (!/^[/a-zA-Z0-9_.-]+$/.test(mount.source as string)) {
                return I18n.t('Volume names may only contain alphanumeric characters, "-", "_" and "."');
            }
        } else if (mount.type === 'tmpfs') {
            if (mount.source) {
                return I18n.t('Source must be empty for tmpfs mounts');
            }
        } else if (mount.type === 'npipe') {
            if (mount.source) {
                // Validate Windows pipe path
                if (!/^\\\\\.\\pipe\\[a-zA-Z0-9_.-]+$/.test(mount.source as string)) {
                    return I18n.t('Please enter a valid Windows pipe path for all npipe mounts');
                }
            }
        } else {
            return I18n.t('Invalid mount type');
        }
    }

    return null;
}

export default function VolumeTab(props: {
    containers: ContainerInfo[] | null;
    config: ContainerConfig;
    requesting: boolean;
    onChange: (config: ContainerConfig) => void;
}): React.JSX.Element {
    const error = validateConfig(props.config, [], props.containers);
    // Table with mounts
    return (
        <div style={styles.tab}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell style={{ width: 130 }}>{I18n.t('Mount type')}</TableCell>
                        <TableCell>{I18n.t('Host path')}</TableCell>
                        <TableCell>{I18n.t('Container path')}</TableCell>
                        <TableCell style={{ width: 80 }}>{I18n.t('Read only')}</TableCell>
                        <TableCell style={{ width: 50 }} />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(props.config.mounts || []).map((mount: VolumeMount, index: number) => (
                        <TableRow key={index}>
                            <TableCell>
                                <FormControl
                                    fullWidth
                                    variant="standard"
                                >
                                    <Select
                                        disabled={props.requesting}
                                        variant="standard"
                                        value={mount.type || 'bind'}
                                        onChange={e => {
                                            const mounts = [...(props.config.mounts || [])];
                                            mounts[index] = {
                                                ...mounts[index],
                                                type: e.target.value,
                                            };
                                            props.onChange({
                                                ...props.config,
                                                mounts,
                                            });
                                        }}
                                    >
                                        <MenuItem value="bind">bind</MenuItem>
                                        <MenuItem value="volume">volume</MenuItem>
                                        <MenuItem value="tmpfs">tmpfs</MenuItem>
                                        <MenuItem value="npipe">npipe</MenuItem>
                                    </Select>
                                </FormControl>
                            </TableCell>
                            <TableCell>
                                <TextField
                                    disabled={props.requesting}
                                    variant="standard"
                                    fullWidth
                                    value={mount.source || ''}
                                    onChange={e => {
                                        const mounts = [...(props.config.mounts || [])];
                                        mounts[index] = {
                                            ...mounts[index],
                                            source: e.target.value,
                                        };
                                        props.onChange({
                                            ...props.config,
                                            mounts,
                                        });
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <TextField
                                    fullWidth
                                    disabled={props.requesting}
                                    variant="standard"
                                    value={mount.target || ''}
                                    onChange={e => {
                                        const mounts = [...(props.config.mounts || [])];
                                        mounts[index] = {
                                            ...mounts[index],
                                            target: e.target.value,
                                        };
                                        props.onChange({
                                            ...props.config,
                                            mounts,
                                        });
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <Checkbox
                                    disabled={props.requesting}
                                    checked={!!mount.readOnly}
                                    onChange={() => {
                                        const mounts = [...(props.config.mounts || [])];
                                        mounts[index] = {
                                            ...mounts[index],
                                            readOnly: !mounts[index].readOnly,
                                        };
                                        props.onChange({
                                            ...props.config,
                                            mounts,
                                        });
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <IconButton
                                    disabled={props.requesting}
                                    onClick={() => {
                                        const mounts = [...(props.config.mounts || [])];
                                        mounts.splice(index, 1);
                                        props.onChange({
                                            ...props.config,
                                            mounts,
                                        });
                                    }}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell>
                            <Button
                                disabled={props.requesting}
                                startIcon={<AddIcon />}
                                onClick={() => {
                                    const mounts = [...(props.config.mounts || [])];
                                    mounts.push({ type: 'bind', source: '', target: '', readOnly: false });
                                    props.onChange({
                                        ...props.config,
                                        mounts,
                                    });
                                }}
                            >
                                {I18n.t('Add mount')}
                            </Button>
                        </TableCell>
                        <TableCell colSpan={4}>{error ? <div style={{ color: 'red' }}>{error}</div> : null}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );
}
