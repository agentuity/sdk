import { createSubcommand } from '../../types';
import { clearAuth } from '../../config';
import * as tui from '../../tui';

export const logoutCommand = createSubcommand({
	name: 'logout',
	description: 'Logout of the Agentuity Cloud Platform',
	toplevel: true,

	async handler() {
		await clearAuth();
		tui.success('You have been logged out');
	},
});
