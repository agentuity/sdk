import { createSubcommand } from '../../types.ts';
import { clearAuth, defaultProfileName } from '../../config.ts';
import { clearCachedUserInfo } from '../../cache/index.ts';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';

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

	async handler(ctx) {
		const { options } = ctx;
		await clearAuth();
		clearCachedUserInfo(ctx.config?.name ?? defaultProfileName);
		if (!options.json) {
			tui.success('You have been logged out');
		}
	},
});
