import { oauthClientGet, type APIClient } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

const OAuthClientGetResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	homepage_url: z.string(),
	client_type: z.enum(['public', 'confidential']),
	redirect_uris: z.array(z.string()),
	scopes: z.array(z.string()),
	created_at: z.string(),
	updated_at: z.string(),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a specific OAuth application',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud oidc get <id>'), description: 'Get OAuth application details' },
	],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	schema: {
		args: z.object({
			id: z.string().describe('the OAuth client id'),
		}),
		response: OAuthClientGetResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, options } = ctx;

		let client: Awaited<ReturnType<typeof oauthClientGet>>;
		try {
			client = await tui.spinner('Fetching OAuth application', () => {
				return oauthClientGet(apiClient as APIClient, args.id);
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes('not found')) {
				tui.fatal(`OAuth application '${args.id}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}
			throw error;
		}

		if (!options.json) {
			if (process.stdout.isTTY) {
				tui.newline();
				tui.success('OAuth Application Details:');
				tui.newline();
			}

			const rows = [
				{
					ID: client.id,
					Name: client.name,
					Description: client.description || '-',
					Type: client.client_type,
					'Homepage URL': client.homepage_url || '-',
					'Redirect URIs':
						client.redirect_uris.length > 0 ? client.redirect_uris.join('\n') : '-',
					Scopes: client.scopes.length > 0 ? client.scopes.join(', ') : '-',
					Created: new Date(client.created_at).toLocaleString(),
					Updated: new Date(client.updated_at).toLocaleString(),
				},
			];

			tui.table(rows, undefined, { layout: 'vertical' });
		}

		return client;
	},
});
