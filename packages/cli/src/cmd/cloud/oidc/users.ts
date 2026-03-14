import { oauthClientUsers } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { getGlobalCatalystAPIClient } from '../../../config';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

const OAuthClientUsersResponseSchema = z.array(
	z.object({
		user_id: z.string(),
		scopes: z.array(z.string()),
		created_at: z.string(),
	})
);

export const usersSubcommand = createSubcommand({
	name: 'users',
	description: 'List connected users for an OAuth application',
	tags: ['read-only', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud oidc users <id>'),
			description: 'List connected users for OAuth application',
		},
	],
	requires: { auth: true },
	idempotent: true,
	schema: {
		args: z.object({
			id: z.string().describe('the OAuth client id'),
		}),
		response: OAuthClientUsersResponseSchema,
	},

	async handler(ctx) {
		const { args, logger, auth, options, config } = ctx;
		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			config?.name,
			undefined,
			config
		);

		const users = await tui.spinner('Fetching connected OAuth users', () => {
			return oauthClientUsers(catalystClient, args.id);
		});

		if (!options.json) {
			if (users.length === 0) {
				tui.info('No connected users found');
			} else {
				const rows = users.map((user) => ({
					user_id: user.user_id,
					scopes: user.scopes.join(', '),
					connected_at: new Date(user.created_at).toLocaleString(),
				}));

				tui.table(rows);
			}
		}

		return users;
	},
});
