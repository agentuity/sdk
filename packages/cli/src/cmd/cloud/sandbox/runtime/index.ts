import { createCommand } from '../../../../types.ts';
import { listSubcommand } from './list.ts';
import { getCommand } from '../../../../command-prefix.ts';

export const runtimeCommand = createCommand({
	name: 'runtime',
	aliases: ['rt', 'runtimes'],
	description: 'Manage sandbox runtimes',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox runtime list'),
			description: 'List all available runtimes',
		},
	],
	subcommands: [listSubcommand],
	requires: { auth: true, org: true },
});

export default runtimeCommand;
