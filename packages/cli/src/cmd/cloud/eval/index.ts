import { createCommand } from '../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { getCommand } from '../../../command-prefix';

export const evalCommand = createCommand({
	name: 'eval',
	aliases: ['evals'],
	description: 'Manage evals',
	tags: ['requires-auth'],
	examples: [
		{ command: getCommand('cloud eval list'), description: 'List all evals' },
		{ command: getCommand('cloud eval get <id>'), description: 'Get eval details' },
	],
	subcommands: [getSubcommand, listSubcommand],
});
