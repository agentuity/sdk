import { z } from 'zod';
import { listOrgResources } from '@agentuity/server';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getGlobalCatalystAPIClient } from '../../../config.ts';
import { getCommand } from '../../../command-prefix.ts';
import { ErrorCode } from '../../../errors.ts';
import { createS3Client } from './utils.ts';
import { setResourceInfo } from '../../../cache/index.ts';

const StorageListResponseSchema = z.object({
	buckets: z
		.array(
			z.object({
				bucket_name: z.string().describe('Storage bucket name'),
				access_key: z.string().optional().describe('S3 access key'),
				secret_key: z.string().optional().describe('S3 secret key'),
				region: z.string().optional().describe('S3 region'),
				endpoint: z.string().optional().describe('S3 endpoint URL'),
				cloud_region: z.string().optional().describe('Cloud region where bucket is hosted'),
				org_id: z.string().optional().describe('Organization ID that owns this bucket'),
				org_name: z.string().optional().describe('Organization name that owns this bucket'),
				bucket_type: z.string().optional().describe('Bucket type (user or snapshots)'),
				internal: z.boolean().optional().describe('Whether this is a system-managed bucket'),
				description: z.string().optional().describe('Optional description of the bucket'),
				object_count: z.number().int().optional().describe('Number of objects in this bucket'),
				total_size: z.number().int().optional().describe('Total size of objects in bytes'),
				last_event_at: z.string().optional().describe('Last activity timestamp'),
			})
		)
		.optional()
		.describe('List of storage resources'),
	files: z
		.array(
			z.object({
				key: z.string().describe('File key/path'),
				size: z.number().describe('File size in bytes'),
				lastModified: z.string().describe('Last modified timestamp'),
			})
		)
		.optional()
		.describe('List of files in bucket'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List storage resources or files in a bucket',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud storage list'), description: 'List items' },
		{ command: getCommand('cloud storage list my-bucket'), description: 'List items' },
		{
			command: getCommand('cloud storage list my-bucket path/prefix'),
			description: 'List items',
		},
		{
			command: getCommand('--json cloud storage list'),
			description: 'Show output in JSON format',
		},
		{ command: getCommand('cloud storage ls'), description: 'List items' },
		{
			command: getCommand('cloud storage list --show-credentials'),
			description: 'Use show credentials option',
		},
	],
	schema: {
		args: z.object({
			name: z.string().optional().describe('Bucket name to list files from'),
			prefix: z.string().optional().describe('Path prefix to filter files'),
		}),
		options: z.object({
			orgId: z.string().optional().describe('filter by organization id'),
			name: z.string().optional().describe('Filter by bucket name'),
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
			nameOnly: z.boolean().optional().describe('Print the name only'),
			sort: z
				.enum(['name', 'created', 'region'])
				.default('created')
				.describe('field to sort by'),
			direction: z.enum(['asc', 'desc']).default('desc').describe('sort direction'),
			limit: z.coerce.number().min(0).optional().describe('Maximum number of results to return'),
			offset: z.coerce.number().min(0).optional().describe('Offset for pagination'),
		}),
		response: StorageListResponseSchema,
	},
	webUrl: (ctx) =>
		ctx.args.name
			? `/services/storage/${encodeURIComponent(ctx.args.name)}`
			: '/services/storage',

	async handler(ctx) {
		const { logger, args, opts, options, auth, config } = ctx;

		const catalystClient = await getGlobalCatalystAPIClient(logger, auth, config?.name);

		const profileName = config?.name ?? 'production';
		const resources = await tui.spinner({
			message: 'Fetching storage',
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, {
					type: 's3',
					orgId: opts?.orgId,
					...(args.name
						? { name: args.name }
						: {
								name: opts?.name,
								sort: opts?.sort,
								direction: opts?.direction,
								limit: opts?.limit,
								offset: opts?.offset,
							}),
				});
			},
		});

		// Cache each bucket with its region and orgId for future lookups
		for (const s3 of resources.s3) {
			if (s3.cloud_region && s3.org_id) {
				await setResourceInfo(
					'bucket',
					profileName,
					s3.bucket_name,
					s3.cloud_region,
					s3.org_id
				);
			}
		}

		// If bucket name is provided, list files in the bucket
		if (args.name) {
			const bucket = resources.s3.find((s3) => s3.bucket_name === args.name);

			if (!bucket) {
				tui.fatal(`Storage bucket '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			if (!bucket.access_key || !bucket.secret_key || !bucket.endpoint) {
				tui.fatal(
					`Storage bucket '${args.name}' is missing credentials`,
					ErrorCode.CONFIG_INVALID
				);
			}

			const s3Client = createS3Client({
				endpoint: bucket.endpoint,
				access_key: bucket.access_key,
				secret_key: bucket.secret_key,
				region: bucket.region,
			});

			const result = await tui.spinner({
				message: `Listing files in ${args.name}${args.prefix ? ` with prefix ${args.prefix}` : ''}`,
				clearOnSuccess: true,
				callback: async () => {
					return s3Client.list(
						args.prefix
							? {
									prefix: args.prefix,
								}
							: null
					);
				},
			});

			const objects = result.contents || [];

			if (!options.json) {
				if (objects.length === 0) {
					tui.info('No files found');
				} else {
					if (opts.nameOnly) {
						for (const obj of objects) {
							console.log(obj.key);
						}
					} else {
						tui.info(
							tui.bold(
								`Files in ${args.name}${args.prefix ? ` (prefix: ${args.prefix})` : ''}`
							)
						);
						tui.newline();
						for (const obj of objects) {
							console.log(
								`${obj.key}  ${tui.muted(`(${obj.size} bytes, ${obj.lastModified})`)}`
							);
						}
					}
				}
			}

			return {
				files: objects.map((obj) => {
					const lastModified = obj.lastModified;
					let lastModifiedStr = '';
					if (typeof lastModified === 'string') {
						lastModifiedStr = lastModified;
					} else if (
						lastModified &&
						typeof lastModified === 'object' &&
						'toISOString' in lastModified
					) {
						lastModifiedStr = (lastModified as Date).toISOString();
					}
					return {
						key: obj.key,
						size: obj.size ?? 0,
						lastModified: lastModifiedStr,
					};
				}),
			};
		}

		// Otherwise, list buckets
		// Mask credentials in terminal output by default, unless --show-credentials is passed
		const shouldShowCredentials = opts.showCredentials === true;
		const shouldMask = !options.json && !shouldShowCredentials;

		// Check if resources span multiple orgs
		const uniqueOrgIds = new Set(resources.s3.map((s3) => s3.org_id));
		const showOrgColumn = uniqueOrgIds.size > 1;

		if (!options.json) {
			if (resources.s3.length === 0) {
				tui.info('No storage buckets found');
			} else {
				if (!opts.nameOnly) {
					tui.info(tui.bold('Storage'));
					tui.newline();
				}
				for (const s3 of resources.s3) {
					if (opts.nameOnly) {
						console.log(s3.bucket_name);
						continue;
					}
					console.log(tui.bold(s3.bucket_name));
					if (showOrgColumn) {
						console.log(` Organization: ${tui.muted(s3.org_name || s3.org_id)}`);
					}
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
					if (s3.object_count != null) {
						const sizeStr =
							s3.total_size != null ? tui.formatBytes(s3.total_size) : 'unknown';
						console.log(
							` Objects:    ${tui.muted(`${s3.object_count.toLocaleString()} (${sizeStr})`)}`
						);
					}
					if (s3.last_event_at) {
						const date = new Date(s3.last_event_at);
						if (Number.isNaN(date.getTime())) {
							console.log(` Activity:   ${tui.muted('unknown')}`);
						} else {
							console.log(
								` Activity:   ${tui.muted(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}`
							);
						}
					}
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
				cloud_region: s3.cloud_region,
				org_id: s3.org_id,
				org_name: s3.org_name,
				bucket_type: s3.bucket_type,
				internal: s3.internal,
				description: s3.description ?? undefined,
				object_count: s3.object_count ?? undefined,
				total_size: s3.total_size ?? undefined,
				last_event_at: s3.last_event_at ?? undefined,
			})),
		};
	},
});
