import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableFooter,
    TextField,
    IconButton,
    Button,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';

import type { ContainerConfig, ContainerInfo, ImageInfo } from '@iobroker/plugin-docker';
import styles from './styles';

export function validateConfig(
    config: ContainerConfig,
    _images: ImageInfo[],
    _containers: ContainerInfo[] | null,
): string | null {
    // All names must be unique and not empty
    if (config.environment) {
        const names = Object.keys(config.environment);
        const uniqueNames = new Set(names);
        if (names.length !== uniqueNames.size) {
            return I18n.t('Environment variable names must be unique');
        }
        if (names.find(name => !name || name.trim() === '')) {
            return I18n.t('Environment variable names cannot be empty');
        }
    }
    return null;
}

export default function EnvironmentTab(props: {
    config: ContainerConfig;
    requesting: boolean;
    onChange: (config: ContainerConfig) => void;
}): React.JSX.Element {
    const error = validateConfig(props.config, [], []);
    // Provide all items with unique key

    // Table with mounts
    return (
        <div style={styles.tab}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{I18n.t('Environment variable name')}</TableCell>
                        <TableCell>{I18n.t('Environment variable value')}</TableCell>
                        <TableCell />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Object.keys(props.config.environment || {}).map((envVar: string, index: number) => (
                        <TableRow key={index}>
                            <TableCell>
                                <TextField
                                    fullWidth
                                    variant="standard"
                                    value={envVar}
                                    disabled={props.requesting}
                                    onChange={e => {
                                        const newEnv = { ...(props.config.environment || {}) };
                                        const value = newEnv[envVar];
                                        delete newEnv[envVar];
                                        newEnv[e.target.value] = value;
                                        props.onChange({
                                            ...props.config,
                                            environment: newEnv,
                                        });
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <TextField
                                    fullWidth
                                    variant="standard"
                                    value={props.config.environment ? props.config.environment[envVar] : ''}
                                    disabled={props.requesting}
                                    onChange={e => {
                                        const newEnv = { ...(props.config.environment || {}) };
                                        newEnv[envVar] = e.target.value;
                                        props.onChange({
                                            ...props.config,
                                            environment: newEnv,
                                        });
                                    }}
                                />
                            </TableCell>
                            <TableCell>
                                <IconButton
                                    disabled={props.requesting}
                                    size="small"
                                    aria-label="delete"
                                    onClick={() => {
                                        const newEnv = { ...(props.config.environment || {}) };
                                        delete newEnv[envVar];
                                        props.onChange({
                                            ...props.config,
                                            environment: newEnv,
                                        });
                                    }}
                                >
                                    <DeleteIcon style={{ cursor: props.requesting ? 'not-allowed' : 'pointer' }} />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell
                            colSpan={5}
                            style={{ display: 'flex', gap: 20 }}
                        >
                            <Button
                                disabled={props.requesting}
                                startIcon={<AddIcon />}
                                onClick={() => {
                                    const newEnv = { ...(props.config.environment || {}) };
                                    let i = 1;
                                    // Find a free name
                                    while (newEnv[`ENV_VAR_${i}`]) {
                                        i++;
                                    }
                                    newEnv[`ENV_VAR_${i}`] = '';
                                    props.onChange({
                                        ...props.config,
                                        environment: newEnv,
                                    });
                                }}
                            >
                                {I18n.t('Add environment variable')}
                            </Button>
                            {error ? <div style={{ color: 'red' }}>{error}</div> : null}
                        </TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );
}
