import { createCommand } from '../../types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { signupCommand } from './signup';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	subcommands: [loginCommand, logoutCommand, signupCommand],
});
