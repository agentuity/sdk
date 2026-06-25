import { createCommand } from '../../types.ts';
import { apikeyCommand } from './apikey.ts';
import { loginCommand } from './login.ts';
import { logoutCommand } from './logout.ts';
import { verifyCommand } from './verify.ts';
import { whoamiCommand } from './whoami.ts';
import { sshSubcommand } from './ssh/index.ts';
import { orgSubcommand } from './org/index.ts';
import { getCommand } from '../../command-prefix.ts';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('auth login'), description: 'Login to your account' },
		{
			command: getCommand(
				'auth login --api-key $AGENTUITY_API_KEY --user-id $AGENTUITY_USER_ID'
			),
			description: 'Store API key credentials for headless environments',
		},
		{ command: getCommand('auth verify --json'), description: 'Validate current credentials' },
		{ command: getCommand('auth whoami'), description: 'Show current user info' },
		{ command: getCommand('auth org select'), description: 'Set default organization' },
	],
	subcommands: [
		apikeyCommand,
		loginCommand,
		logoutCommand,
		verifyCommand,
		whoamiCommand,
		sshSubcommand,
		orgSubcommand,
	],
});
