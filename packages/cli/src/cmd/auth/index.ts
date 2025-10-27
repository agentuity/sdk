import { createCommand } from '@/types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	subcommands: [loginCommand, logoutCommand],
});
