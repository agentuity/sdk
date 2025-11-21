import { createCommand } from '../../types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { signupCommand } from './signup';
import { whoamiCommand } from './whoami';
import { sshSubcommand } from './ssh';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	tags: ['read-only', 'fast'],
	subcommands: [loginCommand, logoutCommand, signupCommand, whoamiCommand, sshSubcommand],
});
