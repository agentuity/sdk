import { createCommand } from '../../types';
import logs from './logs';
import report from './report';
import system from './system';

export const command = createCommand({
	name: 'support',
	description: 'Create support tickets and report issues',
	skipInternalLogging: true,
	subcommands: [logs, report, system],
});
