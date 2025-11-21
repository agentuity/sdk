import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';

export const listNamespacesSubcommand = createCommand({
	name: 'list-namespaces',
	aliases: ['namespaces', 'ns'],
	description: 'List all keyvalue namespaces',
	requires: { auth: true, project: true },

	async handler(ctx) {
		const storage = await createStorageAdapter(ctx);
		const namespaces = await storage.getNamespaces();

		if (namespaces.length === 0) {
			tui.info('No namespaces found');
			return;
		}

		tui.info(`Found ${namespaces.length} namespace(s):`);
		for (const name of namespaces) {
			tui.arrow(name);
		}
	},
});

export default listNamespacesSubcommand;
