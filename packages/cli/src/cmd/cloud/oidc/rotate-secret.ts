import { oauthClientRotateSecret } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';
import { createOAuthClient } from './util';

const OAuthClientRotateSecretResponseSchema = z.object({
	client_id: z.string(),
	client_secret: z.string(),
});

export const rotateSecretSubcommand = createSubcommand({
	name: 'rotate-secret',
	description: 'Rotate the client secret for an OAuth application',
	tags: ['destructive', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud oidc rotate-secret <id>'),
			description: 'Rotate OAuth client secret',
		},
		{
			command: getCommand('cloud oidc rotate-secret <id> --force'),
			description: 'Rotate OAuth client secret without confirmation',
		},
	],
	requires: { auth: true },
	idempotent: false,
	webUrl: (ctx) => `/settings/oauth-apps/${encodeURIComponent(ctx.args.id)}`,
	schema: {
		args: z.object({
			id: z.string().describe('the OAuth client id'),
		}),
		options: z.object({
			force: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: OAuthClientRotateSecretResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const catalystClient = await createOAuthClient(ctx);

		if (!opts.force) {
			const confirmed = await tui.confirm(
				`Rotate secret for OAuth application "${args.id}"?`,
				false
			);
			if (!confirmed) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}
		}

		const result = await tui.spinner('Rotating OAuth client secret', () => {
			return oauthClientRotateSecret(catalystClient, args.id);
		});

		if (!options.json) {
			tui.newline();
			tui.success('OAuth client secret rotated successfully!');
			tui.newline();
			tui.warning('Copy the new client secret now. It will only be shown once.');
			tui.newline();

			tui.table(
				[
					{
						'Client ID': result.client_id,
						'Client Secret': result.client_secret,
					},
				],
				undefined,
				{ layout: 'vertical' }
			);
		}

		return result;
	},
});
