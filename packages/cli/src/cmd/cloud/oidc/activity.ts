import { oauthClientActivity } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import { createOAuthClient } from './util.ts';

const OAuthClientActivityResponseSchema = z.array(
	z.object({
		activity_date: z.string(),
		total_access: z.number(),
		unique_users: z.number(),
	})
);

export const activitySubcommand = createSubcommand({
	name: 'activity',
	description: 'Show activity for an OAuth application',
	tags: ['read-only', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud oidc activity <id>'), description: 'Show OAuth activity' },
		{
			command: getCommand('cloud oidc activity <id> --days=30'),
			description: 'Show OAuth activity for last 30 days',
		},
	],
	requires: { auth: true },
	idempotent: true,
	webUrl: (ctx) => `/settings/oauth-apps/${encodeURIComponent(ctx.args.id)}`,
	schema: {
		args: z.object({
			id: z.string().describe('the OAuth client id'),
		}),
		options: z.object({
			days: z.coerce.number().int().min(1).max(365).default(7).describe('Number of days'),
		}),
		response: OAuthClientActivityResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const catalystClient = await createOAuthClient(ctx);

		const activity = await tui.spinner('Fetching OAuth activity', () => {
			return oauthClientActivity(catalystClient, args.id, opts.days);
		});

		if (!options.json) {
			if (activity.length === 0) {
				tui.info('No OAuth activity found');
			} else {
				const rows = activity.map((item) => ({
					activity_date: item.activity_date,
					total_access: item.total_access,
					unique_users: item.unique_users,
				}));

				tui.table(rows);
			}
		}

		return activity;
	},
});
