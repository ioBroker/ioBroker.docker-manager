import React from 'react';
import { Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { I18n } from '@iobroker/gui-components';
import type { ContainerConfig, ContainerInfo, ImageInfo } from '@iobroker/plugin-docker';

import styles from './styles';

export function validateConfig(
    config: ContainerConfig,
    images: ImageInfo[],
    containers: ContainerInfo[] | null,
    reCreateId?: string,
): string | null {
    if (!config.name) {
        return I18n.t('Please enter a container name');
    }
    if (!reCreateId && containers?.find(c => c.names === config.name)) {
        return I18n.t('Container with this name already exists, please choose another one');
    }
    if (!config.image) {
        return I18n.t('Please select an image');
    }
    if (
        !images.find(img =>
            img.tag && img.tag !== '<none>' ? `${img.repository}:${img.tag}` === config.image : img.id === config.image,
        )
    ) {
        return I18n.t('Selected image not found, please select another one');
    }
    return null;
}

export default function MainTab(props: {
    images: ImageInfo[];
    containers: ContainerInfo[];
    config: ContainerConfig;
    requesting: boolean;
    onChange: (config: ContainerConfig) => void;
    reCreateId?: string;
}): React.JSX.Element {
    const nameUnique = props.reCreateId ? true : !props.containers?.find(c => c.names === props.config.name);
    const error = validateConfig(props.config, props.images, props.containers, props.reCreateId);
    return (
        <div style={styles.tab}>
            <FormControl
                fullWidth
                variant="standard"
            >
                <InputLabel>{I18n.t('Image')}</InputLabel>
                <Select
                    disabled={props.requesting || !!props.reCreateId}
                    variant="standard"
                    value={props.config?.image || ''}
                    onChange={e =>
                        props.onChange({
                            ...props.config,
                            image: e.target.value,
                        })
                    }
                >
                    {props.images.map(image => (
                        <MenuItem
                            key={`${image.repository}:${image.tag}`}
                            value={image.tag && image.tag !== '<none>' ? `${image.repository}:${image.tag}` : image.id}
                        >
                            {image.tag ? `${image.repository}:${image.tag}` : `${image.repository} [${image.id}]`}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <TextField
                disabled={props.requesting || !!props.reCreateId}
                error={!nameUnique}
                helperText={
                    nameUnique ? '' : I18n.t('Container with this name already exists, please choose another one')
                }
                label={I18n.t('Container name')}
                variant="standard"
                autoFocus
                fullWidth
                value={props.config?.name || ''}
                onChange={e =>
                    props.onChange({
                        ...props.config,
                        name: e.target.value,
                    })
                }
            />
            {props.config.name && props.config.image ? (
                <div style={{ width: '100%' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                disabled={props.requesting || !!props.reCreateId}
                                checked={!!props.config.removeOnExit}
                                onClick={() =>
                                    props.onChange({
                                        ...props.config,
                                        removeOnExit: !props.config?.removeOnExit,
                                    })
                                }
                            />
                        }
                        label={I18n.t('Remove container on stop')}
                    />
                    <div style={styles.helpText}>
                        {I18n.t('If activated, container is removed after exit (cannot be used with restart policies)')}
                    </div>
                </div>
            ) : null}
            {error ? <div style={{ color: 'red' }}>{error}</div> : null}
        </div>
    );
}
