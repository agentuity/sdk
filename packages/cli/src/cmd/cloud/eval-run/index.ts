import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { getCommand } from '../../../command-prefix';

export const evalRunCommand = createCommand({
	name: 'eval-run',
	description: 'Manage eval runs',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud eval-run list'), description: 'List all eval runs' },
		{ command: getCommand('cloud eval-run get <id>'), description: 'Get eval run details' },
	],
	subcommands: [getSubcommand, listSubcommand],
});
