import { createCommand } from '../../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { getCommand } from '../../../../command-prefix.ts';

export const command = createCommand({
	name: 'execution',
	aliases: ['executions'],
	description: 'Manage sandbox executions',
	tags: ['read-only', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox execution list sbx_abc123'),
			description: 'List executions for a sandbox',
		},
		{
			command: getCommand('cloud sandbox execution get exec_abc123'),
			description: 'Get details of a specific execution',
		},
	],
	subcommands: [getSubcommand, listSubcommand],
	requires: { auth: true, org: true },
});

export default command;
