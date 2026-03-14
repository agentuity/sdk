import { oauthClientList, type APIClient } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

const OAuthClientListResponseSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		client_type: z.enum(['public', 'confidential']),
		scopes: z.array(z.string()),
		user_count: z.number(),
		created_at: z.string(),
	})
);

function shortId(id: string): string {
	if (id.length <= 12) return id;
	return `${id.slice(0, 12)}…`;
}

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all OAuth applications',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud oidc list'), description: 'List OAuth applications' },
		{ command: getCommand('cloud oidc ls'), description: 'List OAuth applications' },
	],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		response: OAuthClientListResponseSchema,
	},

	async handler(ctx) {
		const { apiClient, options } = ctx;

		const clients = await tui.spinner('Fetching OAuth applications', () => {
			return oauthClientList(apiClient as APIClient);
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
					ID: shortId(client.id),
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
