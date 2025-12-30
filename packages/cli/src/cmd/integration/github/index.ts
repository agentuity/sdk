import { createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { connectSubcommand } from './connect';
import { disconnectSubcommand } from './disconnect';

export const githubCommand = createCommand({
	name: 'github',
	description: 'GitHub integration commands',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('integration github connect'),
			description: 'Connect GitHub to your organization',
		},
		{
			command: getCommand('integration github disconnect'),
			description: 'Disconnect GitHub from your organization',
		},
	],
	subcommands: [connectSubcommand, disconnectSubcommand],
});
