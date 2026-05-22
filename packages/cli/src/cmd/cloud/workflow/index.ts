import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'workflow',
	aliases: ['workflows', 'wf'],
	description: 'Manage workflows',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
	examples: [
		{ command: getCommand('cloud workflow list'), description: 'List workflows' },
		{
			command: getCommand('cloud workflow get wf_abc123'),
			description: 'Get workflow details',
		},
	],
});

export default command;
