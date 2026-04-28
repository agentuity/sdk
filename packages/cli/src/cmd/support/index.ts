import { createCommand } from '../../types.ts';
import logs from './logs/index.ts';
import report from './report.ts';
import system from './system.ts';

export const command = createCommand({
	name: 'support',
	description: 'Create support tickets and report issues',
	skipInternalLogging: true,
	subcommands: [logs, report, system],
});
