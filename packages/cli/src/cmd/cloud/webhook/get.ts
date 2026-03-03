import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createWebhookAPIClient, getWebhookApiOptions } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { getWebhook, WebhookSchema } from '@agentuity/server/index.ts';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get webhook details',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud webhook get wh_abc123'),
			description: 'Get webhook details',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Webhook ID'),
		}),
		response: WebhookSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, options } = ctx;
		const client = await createWebhookAPIClient(ctx);
		const apiOptions = getWebhookApiOptions(ctx);

		const webhook = await getWebhook(client, args.id, apiOptions);

		if (!options.json) {
			const details: Record<string, unknown> = {
				Name: webhook.name,
				ID: webhook.id,
			};

			if (webhook.description) {
				details.Description = webhook.description;
			}

			if (webhook.url) {
				details.URL = webhook.url;
			}

			details['Created By'] = webhook.created_by;
			details.Created = new Date(webhook.created_at).toLocaleString();
			details.Updated = new Date(webhook.updated_at).toLocaleString();

			tui.table([details], undefined, { layout: 'vertical' });
		}

		return webhook;
	},
});

export default getSubcommand;
