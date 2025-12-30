import { createSubcommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { connectSubcommand } from './connect';

export const githubCommand = createSubcommand({
	name: 'github',
	description: 'GitHub integration commands',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('integration github connect'),
			description: 'Connect GitHub to your organization',
		},
	],
	subcommands: [connectSubcommand],
});

