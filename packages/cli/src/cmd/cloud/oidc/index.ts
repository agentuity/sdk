import { createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { createSubcommand } from './create';
import { deleteSubcommand } from './delete';
import { rotateSecretSubcommand } from './rotate-secret';
import { activitySubcommand } from './activity';
import { usersSubcommand } from './users';

export const command = createCommand({
	name: 'oidc',
	description: 'Manage OAuth applications',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud oidc list'), description: 'List all OAuth applications' },
		{
			command: getCommand(
				'cloud oidc create --name "My App" --type confidential --redirect-uris "https://example.com/callback"'
			),
			description: 'Create a new OAuth application',
		},
	],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		rotateSecretSubcommand,
		activitySubcommand,
		usersSubcommand,
	],
});

export default command;
