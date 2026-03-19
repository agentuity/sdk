import { oauthClientDelete } from '@agentuity/core';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';
import { createOAuthClient } from './util';

const OAuthClientDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	id: z.string().describe('OAuth client id that was deleted'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove', 'terminate'],
	description: 'Delete an OAuth application',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	examples: [
		{ command: getCommand('cloud oidc delete <id>'), description: 'Delete OAuth application' },
		{
			command: getCommand('cloud oidc delete <id> --force'),
			description: 'Delete OAuth application without confirmation',
		},
	],
	requires: { auth: true },
	webUrl: '/settings/oauth-apps',
	schema: {
		args: z.object({
			id: z.string().describe('the OAuth client id to delete'),
		}),
		options: z.object({
			force: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
			yes: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: OAuthClientDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const catalystClient = await createOAuthClient(ctx);

		const skipConfirm = opts.force || opts.yes;

		if (!skipConfirm) {
			const confirmed = await tui.confirm(`Delete OAuth application "${args.id}"?`, false);
			if (!confirmed) {
				tui.fatal('Operation cancelled', ErrorCode.USER_CANCELLED);
			}
		}

		await tui.spinner('Deleting OAuth application', () => {
			return oauthClientDelete(catalystClient, args.id);
		});

		if (!options.json) {
			tui.success(`OAuth application '${args.id}' deleted successfully`);
		}

		return {
			success: true,
			id: args.id,
		};
	},
});
