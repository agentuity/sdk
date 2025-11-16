import { createCommand } from '../../types';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { signupCommand } from './signup';
import { whoamiCommand } from './whoami';
import { addCommand as sshAddCommand } from './ssh/add';
import { listCommand as sshListCommand } from './ssh/list';
import { removeCommand as sshRemoveCommand } from './ssh/remove';

export const command = createCommand({
	name: 'auth',
	description: 'Authentication and authorization related commands',
	subcommands: [
		loginCommand,
		logoutCommand,
		signupCommand,
		whoamiCommand,
		sshAddCommand,
		sshListCommand,
		sshRemoveCommand,
	],
});
