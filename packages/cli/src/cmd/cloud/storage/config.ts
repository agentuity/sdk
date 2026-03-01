import { z } from 'zod';
import {
	getBucketConfig,
	updateBucketConfig,
	deleteBucketConfig,
	BucketConfigResponseError,
	listOrgResources,
	type BucketConfigUpdate,
	type BucketConfig,
	StorageTierSchema,
} from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient, getGlobalCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { getResourceInfo, setResourceInfo } from '../../../cache';

function displayConfig(config: BucketConfig) {
	tui.newline();
	console.log(tui.bold('Bucket:          ') + config.bucket_name);
	console.log(
		tui.bold('Storage Tier:    ') + (config.storage_tier ?? tui.muted('default'))
	);
	console.log(
		tui.bold('TTL:             ') +
			(config.ttl != null ? `${config.ttl}s` : tui.muted('default'))
	);
	console.log(
		tui.bold('Public:          ') +
			(config.public != null ? String(config.public) : tui.muted('default'))
	);
	console.log(
		tui.bold('Cache Control:   ') + (config.cache_control ?? tui.muted('default'))
	);
	console.log(
		tui.bold('Bucket Location: ') + (config.bucket_location ?? tui.muted('default'))
	);

	if (config.cors) {
		console.log(tui.bold('CORS:'));
		if (config.cors.allowed_origins?.length) {
			console.log('  Origins: ' + config.cors.allowed_origins.join(', '));
		}
		if (config.cors.allowed_methods?.length) {
			console.log('  Methods: ' + config.cors.allowed_methods.join(', '));
		}
		if (config.cors.allowed_headers?.length) {
			console.log('  Headers: ' + config.cors.allowed_headers.join(', '));
		}
		if (config.cors.expose_headers?.length) {
			console.log('  Expose:  ' + config.cors.expose_headers.join(', '));
		}
		if (config.cors.max_age_seconds != null) {
			console.log('  Max Age: ' + config.cors.max_age_seconds + 's');
		}
	} else {
		console.log(tui.bold('CORS:            ') + tui.muted('default'));
	}

	if (config.additional_headers && Object.keys(config.additional_headers).length > 0) {
		console.log(tui.bold('Headers:'));
		for (const [key, value] of Object.entries(config.additional_headers)) {
			console.log(`  ${key}: ${value}`);
		}
	} else {
		console.log(tui.bold('Headers:         ') + tui.muted('default'));
	}
	tui.newline();
}

export const configSubcommand = createSubcommand({
	name: 'config',
	description: 'View or update bucket configuration',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true },
	optional: { org: true },
	idempotent: true,
	examples: [
		{
			command: `${getCommand('cloud storage config')} my-bucket`,
			description: 'View bucket configuration',
		},
		{
			command: `${getCommand('cloud storage config')} my-bucket --ttl 3600 --public`,
			description: 'Update bucket TTL and make it public',
		},
		{
			command: `${getCommand('cloud storage config')} my-bucket --storage-tier ARCHIVE`,
			description: 'Change the storage tier',
		},
		{
			command: `${getCommand('cloud storage config')} my-bucket --reset`,
			description: 'Reset all configuration to system defaults',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('The name of the storage bucket'),
		}),
		options: z.object({
			reset: z.boolean().optional().describe('Reset all configuration to system defaults'),
			storageTier: StorageTierSchema.optional().describe('Storage tier'),
			ttl: z.coerce.number().optional().describe('Object TTL in seconds (0 to clear)'),
			public: z.boolean().optional().describe('Make bucket publicly accessible'),
			cacheControl: z.string().optional().describe('Cache-Control header value'),
			bucketLocation: z.string().optional().describe('Bucket location'),
			cors: z.string().optional().describe('CORS configuration as JSON string'),
			additionalHeaders: z
				.string()
				.optional()
				.describe('Additional headers as JSON key-value pairs'),
		}),
		response: z.object({
			bucket_name: z.string(),
			storage_tier: z.string().nullable().optional(),
			ttl: z.number().nullable().optional(),
			public: z.boolean().nullable().optional(),
			cache_control: z.string().nullable().optional(),
			cors: z.any().nullable().optional(),
			additional_headers: z.record(z.string(), z.string()).nullable().optional(),
			bucket_location: z.string().nullable().optional(),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts, options, auth, config } = ctx;
		const { name: bucketName } = args;

		const profileName = config?.name ?? 'production';
		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, profileName);

		// Look up bucket to get cloud_region
		const cachedInfo = await getResourceInfo('bucket', profileName, bucketName);
		const orgId = ctx.orgId ?? cachedInfo?.orgId;

		const resources = await tui.spinner({
			message: 'Looking up bucket...',
			clearOnSuccess: true,
			callback: () => listOrgResources(catalystClient, { type: 's3', orgId }),
		});

		const bucket = resources.s3.find((s3) => s3.bucket_name === bucketName);
		if (!bucket) {
			throw new BucketConfigResponseError({ message: `Bucket "${bucketName}" not found` });
		}

		// Cache the bucket info for future lookups
		if (bucket.cloud_region && bucket.org_id) {
			await setResourceInfo(
				'bucket',
				profileName,
				bucket.bucket_name,
				bucket.cloud_region,
				bucket.org_id
			);
		}

		if (!bucket.cloud_region) {
			throw new BucketConfigResponseError({
				message: `Bucket "${bucketName}" is missing region information`,
			});
		}

		// Create regional client for bucket config operations (orgId required for CLI auth)
		const regionalClient = getCatalystAPIClient(logger, auth, bucket.cloud_region, bucket.org_id);

		// Handle --reset flag (DELETE)
		if (opts.reset) {
			await tui.spinner({
				message: 'Resetting bucket configuration...',
				clearOnSuccess: true,
				callback: () => deleteBucketConfig(regionalClient, bucketName),
			});
			if (!options.json) {
				tui.success(`Configuration reset to defaults for bucket "${bucketName}"`);
			}
			return { bucket_name: bucketName };
		}

		// Check if any update flags are present
		const hasUpdateFlags =
			opts.storageTier !== undefined ||
			opts.ttl !== undefined ||
			opts.public !== undefined ||
			opts.cacheControl !== undefined ||
			opts.bucketLocation !== undefined ||
			opts.cors !== undefined ||
			opts.additionalHeaders !== undefined;

		if (hasUpdateFlags) {
			// Build update payload
			const update: BucketConfigUpdate = {};

			if (opts.storageTier !== undefined) update.storage_tier = opts.storageTier;
			if (opts.ttl !== undefined) update.ttl = opts.ttl === 0 ? null : opts.ttl;
			if (opts.public !== undefined) update.public = opts.public;
			if (opts.cacheControl !== undefined) update.cache_control = opts.cacheControl;
			if (opts.bucketLocation !== undefined)
				update.bucket_location = opts.bucketLocation;

			// Parse JSON flags
			if (opts.cors !== undefined) {
				try {
					update.cors = JSON.parse(opts.cors);
				} catch {
					throw new BucketConfigResponseError({
						message: 'Invalid JSON for --cors flag',
					});
				}
			}
			if (opts.additionalHeaders !== undefined) {
				try {
					update.additional_headers = JSON.parse(opts.additionalHeaders);
				} catch {
					throw new BucketConfigResponseError({
						message: 'Invalid JSON for --additionalHeaders flag',
					});
				}
			}

			const result = await tui.spinner({
				message: 'Updating bucket configuration...',
				clearOnSuccess: true,
				callback: () => updateBucketConfig(regionalClient, bucketName, update),
			});

			if (!options.json) {
				displayConfig(result);
				tui.success(`Configuration updated for bucket "${bucketName}"`);
			}
			return result;
		}

		// No update flags — GET and display
		const getResult = await tui.spinner({
			message: 'Fetching bucket configuration...',
			clearOnSuccess: true,
			callback: () => getBucketConfig(regionalClient, bucketName),
		});

		if (!options.json) {
			displayConfig(getResult);
		}
		return getResult;
	},
});
