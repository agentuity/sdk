import { createCommand } from '../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { getCommand } from '../../../command-prefix.ts';

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
