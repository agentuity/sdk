import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { getCommand } from '../../../command-prefix';

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
