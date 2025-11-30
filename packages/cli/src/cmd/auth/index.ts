import { createCommand } from '../../types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { signupCommand } from './signup';
import { whoamiCommand } from './whoami';
import { sshSubcommand } from './ssh';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('auth login'), description: 'Login to your account' },
		{ command: getCommand('auth whoami'), description: 'Show current user info' },
	],
	subcommands: [loginCommand, logoutCommand, signupCommand, whoamiCommand, sshSubcommand],
});
