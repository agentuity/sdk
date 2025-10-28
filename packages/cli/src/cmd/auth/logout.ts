import type { SubcommandDefinition } from '@/types';
import { clearAuth } from '@/config';
import * as tui from '@/tui';

export const logoutCommand: SubcommandDefinition = {
	name: 'logout',
	description: 'Logout of the Agentuity Cloud Platform',
	toplevel: true,

	async handler() {
		await clearAuth();
		tui.success('You have been logged out');
	},
};
