import { createCommand } from '../../../types.ts';
import { getCommand } from '../../../command-prefix.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { createSubcommand } from './create.ts';
import { deleteSubcommand } from './delete.ts';
import { rotateSecretSubcommand } from './rotate-secret.ts';
import { activitySubcommand } from './activity.ts';
import { usersSubcommand } from './users.ts';

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
