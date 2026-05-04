import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWebhookAPIClient, getWebhookApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { deleteWebhook } from '@agentuity/server';
import { ErrorCode } from '../../../errors.ts';

const DeleteResponseSchema = z.object({
	success: z.boolean(),
	id: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove', 'terminate'],
	description: 'Delete a webhook by ID',
	tags: ['mutating', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook delete wh_abc123 --confirm'),
			description: 'Delete a webhook (requires confirmation)',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Webhook ID'),
		}),
		options: z.object({
			confirm: z.boolean().default(false).describe('Skip confirmation prompt'),
		}),
		response: DeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!opts.confirm) {
			tui.fatal('Use --confirm to confirm webhook deletion', ErrorCode.INVALID_ARGUMENT);
		}

		const client = await createWebhookAPIClient(ctx);
		await deleteWebhook(client, args.id, getWebhookApiOptions(ctx));

		if (!options.json) {
			tui.success(`Deleted webhook: ${args.id}`);
		}

		return {
			success: true,
			id: args.id,
		};
	},
});

export default deleteSubcommand;
