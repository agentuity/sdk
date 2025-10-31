import { createCommand } from '../../types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { signupCommand } from './signup';
import { whoamiCommand } from './whoami';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	subcommands: [loginCommand, logoutCommand, signupCommand, whoamiCommand],
});
