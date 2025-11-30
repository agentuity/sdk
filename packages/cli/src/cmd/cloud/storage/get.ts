import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const StorageGetResponseSchema = z.object({
	bucket_name: z.string().describe('Storage bucket name'),
	access_key: z.string().optional().describe('S3 access key'),
	secret_key: z.string().optional().describe('S3 secret key'),
	region: z.string().optional().describe('S3 region'),
	endpoint: z.string().optional().describe('S3 endpoint URL'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show'],
	description: 'Show details about a specific storage bucket',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		{
			command: `${getCommand('cloud storage get')} my-bucket`,
			description: 'Get bucket details',
		},
		{
			command: `${getCommand('cloud storage show')} my-bucket`,
			description: 'Show bucket information',
		},
		{
			command: `${getCommand('cloud storage get')} my-bucket --show-credentials`,
			description: 'Get bucket with credentials',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Bucket name'),
		}),
		options: z.object({
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
		}),
		response: StorageGetResponseSchema,
	},

	async handler(ctx) {
		const { logger, args, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources = await tui.spinner({
			message: `Fetching storage bucket ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		const bucket = resources.s3.find((s3) => s3.bucket_name === args.name);

		if (!bucket) {
			tui.fatal(`Storage bucket '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			console.log(tui.bold('Bucket Name: ') + bucket.bucket_name);
			if (bucket.access_key) {
				const displayAccessKey = shouldMask
					? tui.maskSecret(bucket.access_key)
					: bucket.access_key;
				console.log(tui.bold('Access Key:  ') + displayAccessKey);
			}
			if (bucket.secret_key) {
				const displaySecretKey = shouldMask
					? tui.maskSecret(bucket.secret_key)
					: bucket.secret_key;
				console.log(tui.bold('Secret Key:  ') + displaySecretKey);
			}
			if (bucket.region) {
				console.log(tui.bold('Region:      ') + bucket.region);
			}
			if (bucket.endpoint) {
				console.log(tui.bold('Endpoint:    ') + bucket.endpoint);
			}
		}

		return {
			bucket_name: bucket.bucket_name,
			access_key: bucket.access_key ?? undefined,
			secret_key: bucket.secret_key ?? undefined,
			region: bucket.region ?? undefined,
			endpoint: bucket.endpoint ?? undefined,
		};
	},
});
