import { createCommand } from '../../types';
import { getCommand } from '../../command-prefix';
import { githubCommand } from './github';

export const command = createCommand({
	name: 'integration',
	description: 'Manage integrations with external services',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('integration github connect'),
			description: 'Connect GitHub to your organization',
		},
	],
	subcommands: [githubCommand],
});
