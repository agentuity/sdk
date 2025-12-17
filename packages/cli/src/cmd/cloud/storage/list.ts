import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { createS3Client } from './utils';

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
	requires: { auth: true, org: true, region: true },
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
			showCredentials: z
				.boolean()
				.optional()
				.describe(
					'Show credentials in plain text (default: masked in terminal, unmasked in JSON)'
				),
			nameOnly: z.boolean().optional().describe('Print the name only'),
		}),
		response: StorageListResponseSchema,
	},
	webUrl: (ctx) => (ctx.args.name ? `/services/storage/${ctx.args.name}` : '/services/storage'),

	async handler(ctx) {
		const { logger, args, opts, options, orgId, region, auth } = ctx;

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const resources = await tui.spinner({
			message: `Fetching storage for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

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
