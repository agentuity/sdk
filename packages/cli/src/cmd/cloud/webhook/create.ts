import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createWebhookAPIClient, getWebhookApiOptions } from './util';
import { getCommand } from '../../../command-prefix';
import { createWebhook } from '@agentuity/server';

const WebhookCreateResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_at: z.string(),
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
				description: opts?.description,
			},
			getWebhookApiOptions(ctx)
		);

		if (!options.json) {
			tui.success(`Created webhook: ${webhook.name}`);
			console.log(`  ID: ${webhook.id}`);
		}

		return {
			id: webhook.id,
			name: webhook.name,
			created_at: webhook.created_at,
		};
	},
});

export default createSubcommand;
