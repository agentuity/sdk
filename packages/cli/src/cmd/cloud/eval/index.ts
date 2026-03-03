import { createCommand } from '../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { getCommand } from '../../../command-prefix.ts';

export const evalCommand = createCommand({
	name: 'eval',
	description: 'Manage evals',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud eval list'), description: 'List all evals' },
		{ command: getCommand('cloud eval get <id>'), description: 'Get eval details' },
	],
	subcommands: [getSubcommand, listSubcommand],
});
