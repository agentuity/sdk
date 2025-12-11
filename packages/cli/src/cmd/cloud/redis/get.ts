import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const RedisGetResponseSchema = z.object({
	url: z.string().optional().describe('Redis connection URL'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show'],
	description: 'Show Redis connection URL',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud redis get'), description: 'Get Redis connection URL' },
		{
			command: getCommand('cloud redis get --show-credentials'),
			description: 'Get Redis URL with credentials visible',
		},
		{
			command: getCommand('--json cloud redis get'),
			description: 'Get Redis URL as JSON',
		},
	],
	schema: {
		options: z.object({
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
		}),
		response: RedisGetResponseSchema,
	},

	async handler(ctx) {
		const { logger, opts, options, orgId, region, auth } = ctx;

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const resources = await tui.spinner({
			message: `Fetching Redis for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		if (!resources.redis) {
			tui.info('No Redis provisioned for this organization');
			return { url: undefined };
		}

		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			const displayUrl = shouldMask ? tui.maskSecret(resources.redis.url) : resources.redis.url;
			console.log(tui.bold('Redis URL: ') + displayUrl);
		}

		return {
			url: resources.redis.url,
		};
	},
});
