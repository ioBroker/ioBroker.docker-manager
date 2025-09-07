import React from 'react';
import { Paper, Table, TableRow, TableHead, TableBody, TableCell } from '@mui/material';

import { type AdminConnection, I18n, InfoBox } from '@iobroker/adapter-react-v5';
import type { DiskUsage } from '../types';
import { size2string } from '../Components/utils';

interface InfoTabProps {
    socket: AdminConnection;
    alive: boolean;
    instance: number;
    info?: DiskUsage;
    version?: string;
}

export default function InfoTab(props: InfoTabProps): React.JSX.Element {
    return (
        <Paper style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', padding: 4 }}>
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
            <div>
                <div>
                    {I18n.t('Version')}: {props.version || '--'}
                </div>
                <h2>{I18n.t('Disk usage')}</h2>
            </div>
            <Table size="small">
                <TableHead>
                    <TableRow style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                        <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Type')}</TableCell>
                        <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Total')}</TableCell>
                        <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Active')}</TableCell>
                        <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Size')}</TableCell>
                        <TableCell style={{ fontWeight: 'bold' }}>{I18n.t('Reclaimable')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {['images', 'containers', 'volumes', 'buildCache'].map(
                        (type: 'images' | 'containers' | 'volumes' | 'buildCache') => (
                            <TableRow key={type}>
                                <TableCell>{I18n.t(type.charAt(0).toUpperCase() + type.slice(1))}</TableCell>
                                <TableCell>{props.info ? props.info[type]?.total : '--'}</TableCell>
                                <TableCell>{props.info ? props.info[type]?.active : '--'}</TableCell>
                                <TableCell>{props.info ? size2string(props.info[type]?.size) : '--'}</TableCell>
                                <TableCell>{props.info ? size2string(props.info[type]?.reclaimable) : '--'}</TableCell>
                            </TableRow>
                        ),
                    )}
                    <TableRow>
                        <TableCell>{I18n.t('Total')}</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell>{props.info ? size2string(props.info.total?.size) : '--'}</TableCell>
                        <TableCell>{props.info ? size2string(props.info.total?.reclaimable) : '--'}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </Paper>
    );
}
