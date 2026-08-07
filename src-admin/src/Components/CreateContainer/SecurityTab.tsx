import React from 'react';
import { Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { I18n, type IobTheme } from '@iobroker/gui-components';
import type { ContainerConfig, ContainerInfo, ImageInfo, Security } from '@iobroker/plugin-docker';
import ChipInput from './ChipInput';

import styles from './styles';

export function validateConfig(
    _config: ContainerConfig,
    _images: ImageInfo[],
    _containers: ContainerInfo[] | null,
): string | null {
    return null;
}

export default function SecurityTab(props: {
    config: ContainerConfig;
    requesting: boolean;
    onChange: (config: ContainerConfig) => void;
    theme: IobTheme;
}): React.JSX.Element {
    const error = validateConfig(props.config, [], []);
    /*
    // --privileged
    privileged?: boolean;
    // --cap-add / --cap-drop
    capAdd?: string[];
    capDrop?: string[];
    apparmor?: 'unconfined' | 'docker-default' | string;
    // user namespace: --userns
    usernsMode?: string; // e.g. "host", "private"
    // --ipc / --pid
    ipc?: 'none' | 'host';
    pid?: 'host';
    // SELinux labels (compose style)
    selinuxLabels?: string[];
    // seccomp profile path or "unconfined"
    seccomp?: string;
    // device cgroup rules
    deviceCgroupRules?: string[]; // e.g. "c 189:* rmw"
    // extra groups inside container
    groupAdd?: (number | string)[];
    // no-new-privileges: true | false
    noNewPrivileges?: boolean;
     */
    const apparmorOptions = ['unconfined', 'docker-default'];
    const usernsOptions = ['host', 'private'];
    const ipcOptions = ['none', 'host'];
    const pidOptions = ['host'];
    const handleChange = (key: keyof Security, value: any): void => {
        props.onChange({
            ...props.config,
            security: { ...(props.config.security || {}), [key]: value },
        });
    };

    return (
        <div style={styles.tab}>
            <FormControlLabel
                control={
                    <Checkbox
                        disabled={props.requesting}
                        checked={!!props.config.security?.privileged}
                        onChange={e => handleChange('privileged', e.target.checked)}
                    />
                }
                label="Privileged"
            />
            <FormControlLabel
                control={
                    <Checkbox
                        disabled={props.requesting}
                        checked={!!props.config.security?.noNewPrivileges}
                        onChange={e => handleChange('noNewPrivileges', e.target.checked)}
                    />
                }
                label="No New Privileges"
            />
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>AppArmor</InputLabel>
                <Select
                    disabled={props.requesting}
                    variant="standard"
                    value={props.config.security?.apparmor || ''}
                    onChange={e => handleChange('apparmor', e.target.value)}
                    label="AppArmor"
                >
                    <MenuItem value="">{I18n.t('default')}</MenuItem>
                    {apparmorOptions.map(opt => (
                        <MenuItem
                            key={opt}
                            value={opt}
                        >
                            {opt}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>Userns Mode</InputLabel>
                <Select
                    disabled={props.requesting}
                    variant="standard"
                    value={props.config.security?.usernsMode || ''}
                    onChange={e => handleChange('usernsMode', e.target.value)}
                    label="Userns Mode"
                >
                    {usernsOptions.map(opt => (
                        <MenuItem
                            key={opt}
                            value={opt}
                        >
                            {opt}
                        </MenuItem>
                    ))}
                    <MenuItem value="">(leer)</MenuItem>
                </Select>
            </FormControl>
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>IPC</InputLabel>
                <Select
                    variant="standard"
                    disabled={props.requesting}
                    value={props.config.security?.ipc || ''}
                    onChange={e => handleChange('ipc', e.target.value)}
                    label="IPC"
                >
                    {ipcOptions.map(opt => (
                        <MenuItem
                            key={opt}
                            value={opt}
                        >
                            {opt}
                        </MenuItem>
                    ))}
                    <MenuItem value="">(leer)</MenuItem>
                </Select>
            </FormControl>
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>PID</InputLabel>
                <Select
                    variant="standard"
                    disabled={props.requesting}
                    value={props.config.security?.pid || ''}
                    onChange={e => handleChange('pid', e.target.value)}
                    label="PID"
                >
                    {pidOptions.map(opt => (
                        <MenuItem
                            key={opt}
                            value={opt}
                        >
                            {opt}
                        </MenuItem>
                    ))}
                    <MenuItem value="">(leer)</MenuItem>
                </Select>
            </FormControl>
            <TextField
                variant="standard"
                label="Seccomp"
                disabled={props.requesting}
                value={props.config.security?.seccomp || ''}
                onChange={e => handleChange('seccomp', e.target.value)}
                fullWidth
            />
            {/* Multi-Input Felder */}
            <ChipInput
                variant="standard"
                label="capAdd"
                value={props.config.security?.capAdd || []}
                theme={props.theme}
                disabled={props.requesting}
                instructionText={I18n.t('Press Enter to add')}
                onDelete={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.capAdd ||= [];
                    const pos = config.security.capAdd.indexOf(chip);
                    if (pos !== -1) {
                        config.security.capAdd.splice(pos, 1);
                        props.onChange(config);
                    }
                }}
                onAdd={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.capAdd ||= [];
                    if (!config.security.capAdd.includes(chip)) {
                        config.security.capAdd.push(chip);
                        props.onChange(config);
                    }
                }}
            />
            <ChipInput
                variant="standard"
                label="capDrop"
                value={props.config.security?.capDrop || []}
                disabled={props.requesting}
                theme={props.theme}
                instructionText={I18n.t('Press Enter to add')}
                onDelete={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.capDrop ||= [];
                    const pos = config.security.capDrop.indexOf(chip);
                    if (pos !== -1) {
                        config.security.capDrop.splice(pos, 1);
                        props.onChange(config);
                    }
                }}
                onAdd={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.capDrop ||= [];
                    if (!config.security.capDrop.includes(chip)) {
                        config.security.capDrop.push(chip);
                        props.onChange(config);
                    }
                }}
            />
            <ChipInput
                variant="standard"
                disabled={props.requesting}
                label="SELinux Labels"
                value={props.config.security?.selinuxLabels || []}
                theme={props.theme}
                instructionText={I18n.t('Press Enter to add')}
                onDelete={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.selinuxLabels ||= [];
                    const pos = config.security.selinuxLabels.indexOf(chip);
                    if (pos !== -1) {
                        config.security.selinuxLabels.splice(pos, 1);
                        props.onChange(config);
                    }
                }}
                onAdd={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.selinuxLabels ||= [];
                    if (!config.security.selinuxLabels.includes(chip)) {
                        config.security.selinuxLabels.push(chip);
                        props.onChange(config);
                    }
                }}
            />
            <ChipInput
                variant="standard"
                disabled={props.requesting}
                label="Device Cgroup Rules"
                value={props.config.security?.deviceCgroupRules || []}
                theme={props.theme}
                instructionText={I18n.t('Press Enter to add')}
                onDelete={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.deviceCgroupRules ||= [];
                    const pos = config.security.deviceCgroupRules.indexOf(chip);
                    if (pos !== -1) {
                        config.security.deviceCgroupRules.splice(pos, 1);
                        props.onChange(config);
                    }
                }}
                onAdd={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.deviceCgroupRules ||= [];
                    if (!config.security.deviceCgroupRules.includes(chip)) {
                        config.security.deviceCgroupRules.push(chip);
                        props.onChange(config);
                    }
                }}
            />
            <ChipInput
                variant="standard"
                disabled={props.requesting}
                label="Group Add"
                value={(props.config.security?.groupAdd as string[]) || []}
                theme={props.theme}
                instructionText={I18n.t('Press Enter to add')}
                onDelete={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.groupAdd ||= [];
                    const pos = config.security.groupAdd.indexOf(chip);
                    if (pos !== -1) {
                        config.security.groupAdd.splice(pos, 1);
                        props.onChange(config);
                    }
                }}
                onAdd={chip => {
                    const config = { ...props.config };
                    config.security ||= {};
                    config.security.groupAdd ||= [];
                    if (!config.security.groupAdd.includes(chip)) {
                        config.security.groupAdd.push(chip);
                        props.onChange(config);
                    }
                }}
            />

            {error ? <div style={{ color: 'red' }}>{error}</div> : null}
        </div>
    );
}
