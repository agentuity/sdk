import { oauthClientList } from '@agentuity/core';
import { getCommand } from '../../../command-prefix.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import { createOAuthClient } from './util.ts';

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all OAuth applications',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud oidc list'), description: 'List OAuth applications' },
		{ command: getCommand('cloud oidc ls'), description: 'List OAuth applications' },
	],
	requires: { auth: true },
	idempotent: true,
	webUrl: '/settings/oauth-apps',

	async handler(ctx) {
		const { options } = ctx;
		const catalystClient = await createOAuthClient(ctx);

		const clients = await tui.spinner('Fetching OAuth applications', () => {
			return oauthClientList(catalystClient);
		});

		if (!options.json) {
			if (clients.length === 0) {
				tui.info('No OAuth applications found');
			} else {
				if (process.stdout.isTTY) {
					tui.newline();
					tui.success(`OAuth Applications (${clients.length}):`);
					tui.newline();
				}

				const rows = clients.map((client) => ({
					ID: client.id,
					Name: client.name,
					Type: client.client_type,
					Scopes: client.scopes.length,
					Users: client.user_count,
					Created: new Date(client.created_at).toLocaleString(),
				}));

				tui.table(rows);
			}
		}

		return clients;
	},
});
