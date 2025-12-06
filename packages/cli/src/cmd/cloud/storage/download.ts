import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { createS3Client } from './utils';

export const downloadSubcommand = createSubcommand({
	name: 'download',
	description: 'Download a file from storage bucket',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		{
			command: `${getCommand('cloud storage download')} my-bucket file.txt`,
			description: 'Download file from bucket',
		},
		{
			command: `${getCommand('cloud storage download')} my-bucket file.txt output.txt`,
			description: 'Download file to specific path',
		},
		{
			command: `${getCommand('cloud storage download')} my-bucket file.txt - > output.txt`,
			description: 'Download file to stdout',
		},
		{
			command: `${getCommand('cloud storage download')} my-bucket file.txt --metadata`,
			description: 'Download metadata only',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Bucket name'),
			filename: z.string().describe('File path to download'),
			output: z.string().optional().describe('Output file path or "-" for STDOUT'),
		}),
		options: z.object({
			metadata: z.boolean().optional().describe('Download metadata only (not file contents)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether download succeeded'),
			bucket: z.string().describe('Bucket name'),
			filename: z.string().describe('Downloaded filename'),
			size: z.number().optional().describe('File size in bytes'),
			contentType: z.string().optional().describe('Content type'),
			lastModified: z.string().optional().describe('Last modified timestamp'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts, options, orgId, region, auth } = ctx;

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		// Fetch bucket credentials
		const resources = await tui.spinner({
			message: `Fetching credentials for ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

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

		// Initialize S3 client
		const s3Client = createS3Client({
			endpoint: bucket.endpoint,
			access_key: bucket.access_key,
			secret_key: bucket.secret_key,
			region: bucket.region,
		});

		if (opts.metadata) {
			// Download metadata only
			const metadata = await tui.spinner({
				message: `Fetching metadata for ${args.filename}`,
				clearOnSuccess: true,
				callback: async () => {
					return s3Client.stat(args.filename);
				},
			});

			if (!options.json) {
				console.log(tui.bold('File:          ') + args.filename);
				console.log(tui.bold('Bucket:        ') + args.name);
				if (metadata.size) {
					console.log(tui.bold('Size:          ') + metadata.size + ' bytes');
				}
				if (metadata.type) {
					console.log(tui.bold('Content Type:  ') + metadata.type);
				}
				if (metadata.lastModified) {
					console.log(tui.bold('Last Modified: ') + metadata.lastModified);
				}
			}

			return {
				success: true,
				bucket: args.name,
				filename: args.filename,
				size: metadata.size,
				contentType: metadata.type,
				lastModified: metadata.lastModified?.toISOString(),
			};
		}

		// Download file content
		const s3File = s3Client.file(args.filename);

		const fileContent = await tui.spinner({
			message: `Downloading ${args.filename} from ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return Buffer.from(await s3File.arrayBuffer());
			},
		});

		// Write to output or STDOUT
		const outputPath = args.output || '-';

		if (outputPath === '-') {
			// Write to STDOUT
			// When outputting to STDOUT in JSON mode, we can't mix file content with JSON
			if (options.json) {
				tui.fatal(
					'Cannot use --json with STDOUT output. Use --metadata to get JSON metadata, or specify an output file.',
					ErrorCode.INVALID_ARGUMENT
				);
			}

			process.stdout.write(fileContent);
		} else {
			// Write to file
			await Bun.write(outputPath, fileContent);
			if (!options.json) {
				tui.success(
					`Downloaded ${tui.bold(args.filename)} to ${tui.bold(outputPath)} (${fileContent.length} bytes)`
				);
			}
		}

		return {
			success: true,
			bucket: args.name,
			filename: args.filename,
			size: fileContent.length,
			contentType: s3File.type,
			lastModified: undefined,
		};
	},
});
