import { listOrgResources } from '@agentuity/server';
import { z } from 'zod';
import { setResourceInfo } from '../../../cache';
import { getCommand } from '../../../command-prefix';
import { getGlobalCatalystAPIClient } from '../../../config';
import { ErrorCode } from '../../../errors';
import * as tui from '../../../tui';
import { createSubcommand } from '../../../types';

const StorageGetResponseSchema = z.object({
	bucket_name: z.string().describe('Storage bucket name'),
	access_key: z.string().optional().describe('S3 access key'),
	secret_key: z.string().optional().describe('S3 secret key'),
	region: z.string().optional().describe('S3 region'),
	endpoint: z.string().optional().describe('S3 endpoint URL'),
	org_id: z.string().optional().describe('Organization ID that owns this bucket'),
	org_name: z.string().optional().describe('Organization name that owns this bucket'),
	bucket_type: z.string().optional().describe('Bucket type (user or snapshots)'),
	internal: z.boolean().optional().describe('Whether this is a system-managed bucket'),
	description: z.string().optional().describe('Optional description of the bucket'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show'],
	description: 'Show details about a specific storage bucket',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
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
	webUrl: (ctx) => `/services/storage/${encodeURIComponent(ctx.args.name)}`,

	async handler(ctx) {
		const { logger, args, opts, options, auth, config } = ctx;

		const profileName = config?.name ?? 'production';
		const catalystClient = await getGlobalCatalystAPIClient(
			logger,
			auth,
			profileName,
			undefined,
			config
		);

		// Search across all orgs the user has access to
		const resources = await tui.spinner({
			message: `Fetching storage bucket ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, { type: 's3' });
			},
		});

		const bucket = resources.s3.find((s3) => s3.bucket_name === args.name);

		// Cache the bucket info for future lookups
		if (bucket?.cloud_region && bucket.org_id) {
			await setResourceInfo(
				'bucket',
				profileName,
				bucket.bucket_name,
				bucket.cloud_region,
				bucket.org_id
			);
		}

		if (!bucket) {
			tui.fatal(`Storage bucket '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			console.log(tui.bold('Bucket Name:  ') + bucket.bucket_name);
			if (bucket.org_name || bucket.org_id) {
				console.log(tui.bold('Organization: ') + (bucket.org_name || bucket.org_id));
			}
			if (bucket.access_key) {
				const displayAccessKey = shouldMask
					? tui.maskSecret(bucket.access_key)
					: bucket.access_key;
				console.log(tui.bold('Access Key:   ') + displayAccessKey);
			}
			if (bucket.secret_key) {
				const displaySecretKey = shouldMask
					? tui.maskSecret(bucket.secret_key)
					: bucket.secret_key;
				console.log(tui.bold('Secret Key:   ') + displaySecretKey);
			}
			if (bucket.region) {
				console.log(tui.bold('Region:       ') + bucket.region);
			}
			if (bucket.endpoint) {
				console.log(tui.bold('Endpoint:     ') + bucket.endpoint);
			}
		}

		return {
			bucket_name: bucket.bucket_name,
			access_key: bucket.access_key ?? undefined,
			secret_key: bucket.secret_key ?? undefined,
			region: bucket.region ?? undefined,
			endpoint: bucket.endpoint ?? undefined,
			org_id: bucket.org_id,
			org_name: bucket.org_name,
			bucket_type: bucket.bucket_type,
			internal: bucket.internal,
			description: bucket.description ?? undefined,
		};
	},
});
