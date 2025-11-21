import { z } from 'zod';
import { createCommand } from '../../types';
import * as tui from '../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../command-prefix';

const NamespaceListResponseSchema = z.array(z.string().describe('Namespace name'));

export const listNamespacesSubcommand = createCommand({
	name: 'list-namespaces',
	aliases: ['namespaces', 'ns'],
	description: 'List all keyvalue namespaces',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('kv list-namespaces')} - List all namespaces`,
		`${getCommand('kv namespaces')} - List namespaces (using alias)`,
		`${getCommand('kv ns')} - List namespaces (short alias)`,
	],
	schema: {
		response: NamespaceListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const storage = await createStorageAdapter(ctx);
		const namespaces = await storage.getNamespaces();

		if (namespaces.length === 0) {
			tui.info('No namespaces found');
			return [];
		}

		tui.info(`Found ${namespaces.length} namespace(s):`);
		for (const name of namespaces) {
			tui.arrow(name);
		}

		return namespaces;
	},
});

export default listNamespacesSubcommand;
