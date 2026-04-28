import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWebhookAPIClient, getWebhookApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { listWebhooks, type Webhook } from '@agentuity/server';

const WebhookListResponseSchema = z.object({
	webhooks: z.array(
		z.object({
			name: z.string(),
			id: z.string(),
			description: z.string().nullable().optional(),
			created_at: z.string(),
		})
	),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all webhooks',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{ command: getCommand('cloud webhook list'), description: 'List all webhooks' },
		{ command: getCommand('cloud webhook ls'), description: 'List all webhooks (alias)' },
	],
	schema: {
		args: z.object({}),
		options: z.object({
			orgId: z.string().optional().describe('Filter by organization ID'),
			limit: z.coerce
				.number()
				.min(0)
				.optional()
				.describe('Maximum number of webhooks to return'),
			offset: z.coerce.number().min(0).optional().describe('Offset for pagination'),
		}),
		response: WebhookListResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { options, opts } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const webhookOptions = opts?.orgId ? { orgId: opts.orgId } : getWebhookApiOptions(ctx);
		const result = await listWebhooks(
			client,
			{
				limit: opts.limit,
				offset: opts.offset,
			},
			webhookOptions
		);

		if (!options.json) {
			if (result.webhooks.length === 0) {
				tui.info('No webhooks found');
			} else {
				const tableData = result.webhooks.map((w: Webhook) => ({
					Name: w.name,
					ID: w.id,
					Description: w.description ?? '-',
					Created: new Date(w.created_at).toLocaleString(),
				}));
				tui.table(tableData, ['Name', 'ID', 'Description', 'Created']);
			}
		}

		return {
			webhooks: result.webhooks.map((w: Webhook) => ({
				name: w.name,
				id: w.id,
				description: w.description,
				created_at: w.created_at,
			})),
		};
	},
});

export default listSubcommand;
