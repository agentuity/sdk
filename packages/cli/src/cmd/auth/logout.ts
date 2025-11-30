import { createSubcommand } from '../../types';
import { clearAuth } from '../../config';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';

export const logoutCommand = createSubcommand({
	name: 'logout',
	description: 'Logout of the Agentuity Cloud Platform',
	tags: ['mutating', 'deletes-resource', 'fast', 'requires-auth'],
	toplevel: true,
	idempotent: false,
	examples: [
		{ command: getCommand('auth logout'), description: 'Logout from account' },
		{ command: getCommand('logout'), description: 'Logout from account' },
	],

	async handler() {
		await clearAuth();
		tui.success('You have been logged out');
	},
});
