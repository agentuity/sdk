import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWebhookAPIClient, getWebhookApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { createWebhook, WebhookSchema } from '@agentuity/server';

const WebhookCreateResponseSchema = WebhookSchema.pick({
	id: true,
	name: true,
	url: true,
	created_at: true,
});

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a new webhook',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('cloud webhook create --name my-webhook'),
			description: 'Create a webhook named my-webhook',
		},
		{
			command: getCommand(
				'cloud webhook create --name github-events --description "GitHub webhook"'
			),
			description: 'Create a webhook with a description',
		},
	],
	schema: {
		args: z.object({}),
		options: z.object({
			name: z.string().describe('Webhook name'),
			description: z.string().optional().describe('Webhook description'),
		}),
		response: WebhookCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const client = await createWebhookAPIClient(ctx);

		const webhook = await createWebhook(
			client,
			{
				name: opts.name,
				description: opts.description,
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Created webhook: ${webhook.name}`);
			console.log(`  ID:  ${webhook.id}`);
			if (webhook.url) {
				console.log(`  URL: ${webhook.url}`);
			}
		}

		return {
			id: webhook.id,
			name: webhook.name,
			url: webhook.url,
			created_at: webhook.created_at,
		};
	},
});

export default createSubcommand;
