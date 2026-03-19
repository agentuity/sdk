import { createCommand } from '../../../../types';
import { listSubcommand } from './list';
import { getCommand } from '../../../../command-prefix';

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
