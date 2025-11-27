import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const StorageListResponseSchema = z.object({
	buckets: z
		.array(
			z.object({
				bucket_name: z.string().describe('Storage bucket name'),
				access_key: z.string().optional().describe('S3 access key'),
				secret_key: z.string().optional().describe('S3 secret key'),
				region: z.string().optional().describe('S3 region'),
				endpoint: z.string().optional().describe('S3 endpoint URL'),
			})
		)
		.describe('List of storage resources'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List storage resources',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		getCommand('cloud storage list'),
		getCommand('--json cloud storage list'),
		getCommand('cloud storage ls'),
		getCommand('cloud storage list --show-credentials'),
	],
	schema: {
		options: z.object({
			showCredentials: z
				.boolean()
				.optional()
				.describe('Show credentials in plain text (default: masked in terminal, unmasked in JSON)'),
		}),
		response: StorageListResponseSchema,
	},

	async handler(ctx) {
		const { logger, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources = await tui.spinner({
			message: `Fetching storage for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		if (!options.json) {
			if (resources.s3.length === 0) {
				tui.info('No storage buckets found');
			} else {
				tui.info(tui.bold('Storage'));
				tui.newline();
				for (const s3 of resources.s3) {
					console.log(tui.bold(s3.bucket_name));
					if (s3.access_key) {
						const displayAccessKey = shouldMask
							? tui.maskSecret(s3.access_key)
							: s3.access_key;
						console.log(` Access Key: ${tui.muted(displayAccessKey)}`);
					}
					if (s3.secret_key) {
						const displaySecretKey = shouldMask
							? tui.maskSecret(s3.secret_key)
							: s3.secret_key;
						console.log(` Secret Key: ${tui.muted(displaySecretKey)}`);
					}
					if (s3.region) console.log(` Region:     ${tui.muted(s3.region)}`);
					if (s3.endpoint) console.log(` Endpoint:   ${tui.muted(s3.endpoint)}`);
					tui.newline();
				}
			}
		}

		return {
			buckets: resources.s3.map((s3) => ({
				bucket_name: s3.bucket_name,
				access_key: s3.access_key ?? undefined,
				secret_key: s3.secret_key ?? undefined,
				region: s3.region ?? undefined,
				endpoint: s3.endpoint ?? undefined,
			})),
		};
	},
});
