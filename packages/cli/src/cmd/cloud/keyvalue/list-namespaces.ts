import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';
const NamespaceListResponseSchema = z.array(z.string().describe('Namespace name'));

export const listNamespacesSubcommand = createCommand({
	name: 'list-namespaces',
	aliases: ['namespaces', 'ns'],
	description: 'List all keyvalue namespaces',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, region: true },
	optional: { project: true },
	examples: [
		{ command: getCommand('cloud kv list-namespaces'), description: 'List all namespaces' },
		{ command: getCommand('cloud kv namespaces'), description: 'List namespaces (using alias)' },
		{ command: getCommand('cloud kv ns'), description: 'List namespaces (short alias)' },
	],
	schema: {
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
		}),
		response: NamespaceListResponseSchema,
	},
	webUrl: '/services/kv',
	idempotent: true,

	async handler(ctx) {
		const { options, opts } = ctx;
		const storage = await createStorageAdapter(ctx, opts?.orgId);
		const namespaces = await storage.getNamespaces();

		if (!options.json) {
			if (namespaces.length === 0) {
				tui.info('No namespaces found');
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
