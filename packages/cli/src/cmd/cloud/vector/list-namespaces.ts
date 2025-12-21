import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const NamespaceListResponseSchema = z.array(z.string().describe('Namespace name'));

export const listNamespacesSubcommand = createCommand({
	name: 'list-namespaces',
	aliases: ['namespaces', 'ns'],
	description: 'List all vector namespaces',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	examples: [
		{ command: getCommand('vector list-namespaces'), description: 'List all namespaces' },
		{ command: getCommand('vector namespaces'), description: 'List namespaces (using alias)' },
		{ command: getCommand('vector ns'), description: 'List namespaces (short alias)' },
	],
	schema: {
		response: NamespaceListResponseSchema,
	},
	webUrl: '/services/vector',
	idempotent: true,

	async handler(ctx) {
		const { options } = ctx;
		const storage = await createStorageAdapter(ctx);
		const namespaces = await storage.getNamespaces();

		if (!options.json) {
			if (namespaces.length === 0) {
				tui.info('No vector namespaces found');
			} else {
				tui.info(`Found ${namespaces.length} namespace(s):`);
				for (const name of namespaces) {
					tui.arrow(name);
				}
			}
		}

		return namespaces;
	},
});

export default listNamespacesSubcommand;
