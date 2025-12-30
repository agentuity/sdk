import { createCommand } from '../../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { getCommand } from '../../../../command-prefix';

export const command = createCommand({
	name: 'execution',
	aliases: ['executions'],
	description: 'Manage sandbox executions',
	tags: ['read-only', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox execution list snbx_abc123'),
			description: 'List executions for a sandbox',
		},
		{
			command: getCommand('cloud sandbox execution get exec_abc123'),
			description: 'Get details of a specific execution',
		},
	],
	subcommands: [getSubcommand, listSubcommand],
	requires: { auth: true, region: true, org: true },
});

export default command;
