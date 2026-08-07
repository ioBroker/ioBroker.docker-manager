import React from 'react';
import { Paper } from '@mui/material';
import {
    Layers as ImagesIcon,
    ViewInAr as ContainersIcon,
    Storage as VolumesIcon,
    Cached as BuildCacheIcon,
} from '@mui/icons-material';

import { type AdminConnection, I18n, InfoBox, StatCard, CardTitle, InfoRow } from '@iobroker/gui-components';
import type { DiskUsage } from '@iobroker/plugin-docker';
import { size2string } from '../Components/utils';

/** plugin-docker does not export SizeInfo itself, so take it off DiskUsage */
type SizeInfo = NonNullable<DiskUsage['images']>;

interface InfoTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    info?: DiskUsage;
    dockerInfo?: {
        version?: string;
        daemonRunning?: boolean;
        removeSupported?: boolean;
        driver: 'socket' | 'cli' | 'http' | 'https';
    } | null;
}

/** The four resource kinds `docker system df` reports, in the order they are shown */
const KINDS: {
    key: 'images' | 'containers' | 'volumes' | 'buildCache';
    label: string;
    color: string;
    icon: React.JSX.Element;
}[] = [
    { key: 'images', label: 'Images', color: '#2496ed', icon: <ImagesIcon /> },
    { key: 'containers', label: 'Containers', color: '#27ae60', icon: <ContainersIcon /> },
    { key: 'volumes', label: 'Volumes', color: '#f39c12', icon: <VolumesIcon /> },
    { key: 'buildCache', label: 'Build cache', color: '#8e7cc3', icon: <BuildCacheIcon /> },
];

/** "3 Active - 1.2 GB", or just the size while the counts are still unknown */
function hintOf(entry: SizeInfo | undefined): string | undefined {
    if (!entry) {
        return undefined;
    }
    return `${entry.active} ${I18n.t('Active')} · ${size2string(entry.size)}`;
}

export default function InfoTab(props: InfoTabProps): React.JSX.Element {
    const running = !!props.dockerInfo?.daemonRunning;

    return (
        <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4, overflow: 'auto' }}>
            <InfoBox
                type="info"
                closeable
                storeId="docker-manager.docker"
                iconPosition="top"
            >
                {I18n.t('Docker explanation')
                    .split('\n')
                    .map((line, i) => (
                        <div key={i.toString()}>{line}</div>
                    ))}
            </InfoBox>

            {running ? (
                <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '16px 0' }}>
                        {KINDS.map(kind => {
                            const entry = props.info?.[kind.key];
                            return (
                                <StatCard
                                    key={kind.key}
                                    title={I18n.t(kind.label)}
                                    value={entry ? entry.total.toString() : '--'}
                                    hint={hintOf(entry)}
                                    color={kind.color}
                                    icon={kind.icon}
                                />
                            );
                        })}
                    </div>

                    <div style={{ maxWidth: 520 }}>
                        <CardTitle title={I18n.t('Docker daemon')} />
                        <InfoRow
                            name={I18n.t('Version')}
                            value={props.dockerInfo?.version || '--'}
                        />
                        <InfoRow
                            name={I18n.t('Driver')}
                            value={props.dockerInfo?.driver || '--'}
                        />
                        <InfoRow
                            name={`${I18n.t('Disk usage')} (${I18n.t('Total')})`}
                            value={props.info ? size2string(props.info.total?.size) : '--'}
                        />
                        <InfoRow
                            name={I18n.t('Reclaimable')}
                            value={props.info ? size2string(props.info.total?.reclaimable) : '--'}
                        />
                    </div>
                </>
            ) : (
                <div style={{ marginTop: 16 }}>{I18n.t('Docker daemon is not running')}</div>
            )}
        </Paper>
    );
}
