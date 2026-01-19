import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { statusSubcommand } from './status';
import { pauseSubcommand } from './pause';
import { resumeSubcommand } from './resume';
import { stopSubcommand } from './stop';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'cadence',
	description: 'Manage long-running Cadence loops for Open Code',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('ai cadence list'), description: 'List all Cadence loops' },
		{ command: getCommand('ai cadence status lp_auth_impl'), description: 'Get loop status' },
		{ command: getCommand('ai cadence pause lp_auth_impl'), description: 'Pause a running loop' },
		{ command: getCommand('ai cadence resume lp_auth_impl'), description: 'Resume a paused loop' },
		{ command: getCommand('ai cadence stop lp_auth_impl'), description: 'Stop and cancel a loop' },
	],
	subcommands: [
		listSubcommand,
		statusSubcommand,
		pauseSubcommand,
		resumeSubcommand,
		stopSubcommand,
	],
	requires: { auth: true },
});

export default command;
