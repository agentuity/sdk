import { listOrgResources } from '@agentuity/server';
import { basename } from 'path';
import { z } from 'zod';
import { getResourceInfo, setResourceInfo } from '../../../cache/index.ts';
import { getCommand } from '../../../command-prefix.ts';
import { getGlobalCatalystAPIClient } from '../../../config.ts';
import { ErrorCode } from '../../../errors.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand } from '../../../types.ts';
import { createS3Client } from './utils.ts';

export const uploadSubcommand = createSubcommand({
	name: 'upload',
	aliases: ['put'],
	description: 'Upload a file to storage bucket',
	tags: ['write', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { org: true },
	idempotent: false,
	examples: [
		{
			command: `${getCommand('cloud storage upload')} my-bucket file.txt`,
			description: 'Upload file to bucket',
		},
		{
			command: `${getCommand('cloud storage put')} my-bucket file.txt --content-type text/plain`,
			description: 'Upload file with content type',
		},
		{
			command: `${getCommand('cloud storage upload')} my-bucket file.txt --key custom-name.txt`,
			description: 'Upload file with custom object key',
		},
		{
			command: `cat file.txt | ${getCommand('cloud storage upload')} my-bucket -`,
			description: 'Upload from stdin',
		},
		{
			command: `cat data.json | ${getCommand('cloud storage upload')} my-bucket - --key data.json`,
			description: 'Upload from stdin with custom key',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Bucket name'),
			filename: z.string().describe('File path to upload or "-" for STDIN'),
		}),
		options: z.object({
			key: z
				.string()
				.optional()
				.describe('Remote object key (defaults to basename or "stdin" for piped uploads)'),
			contentType: z
				.string()
				.optional()
				.describe('Content type (auto-detected if not provided)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether upload succeeded'),
			bucket: z.string().describe('Bucket name'),
			filename: z.string().describe('Uploaded filename'),
			size: z.number().describe('File size in bytes'),
		}),
	},

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

		// Check cache first for orgId
		const cachedInfo = await getResourceInfo('bucket', profileName, args.name);
		const orgId = ctx.orgId ?? cachedInfo?.orgId;

		if (!orgId) {
			tui.fatal(
				`Organization not found for bucket '${args.name}'. Run 'agentuity cloud storage list' first or specify --org-id.`,
				ErrorCode.INVALID_ARGUMENT
			);
		}

		// Fetch bucket credentials
		const resources = await tui.spinner({
			message: `Fetching credentials for ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				return listOrgResources(catalystClient, { type: 's3', orgId });
			},
		});

		const bucket = resources.s3.find((s3) => s3.bucket_name === args.name);

		// Cache the bucket info for future lookups
		if (bucket?.cloud_region) {
			await setResourceInfo(
				'bucket',
				profileName,
				bucket.bucket_name,
				bucket.cloud_region,
				orgId
			);
		}

		if (!bucket) {
			tui.fatal(`Storage bucket '${args.name}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		if (!bucket.access_key || !bucket.secret_key || !bucket.endpoint) {
			tui.fatal(
				`Storage bucket '${args.name}' is missing credentials`,
				ErrorCode.CONFIG_INVALID
			);
		}

		// Prepare streaming upload - we don't buffer the entire file in memory
		let stream: ReadableStream<Uint8Array>;

		if (args.filename === '-') {
			// Stream from STDIN
			stream = Bun.stdin.stream();
		} else {
			// Stream from file
			const file = Bun.file(args.filename);
			if (!(await file.exists())) {
				tui.fatal(`File not found: ${args.filename}`, ErrorCode.FILE_NOT_FOUND);
			}
			stream = file.stream();
		}

		// Derive the remote object key:
		// 1. Use --key if provided
		// 2. For stdin (-), default to 'stdin'
		// 3. For files, use the basename
		const objectKey =
			opts.key && opts.key.trim().length > 0
				? opts.key
				: args.filename === '-'
					? 'stdin'
					: basename(args.filename);

		// Auto-detect content type from the object key's extension
		// This allows content-type detection for stdin when --key is provided
		let contentType = opts.contentType;
		if (!contentType) {
			const dotIndex = objectKey.lastIndexOf('.');
			const ext = dotIndex > 0 ? objectKey.substring(dotIndex + 1).toLowerCase() : undefined;
			const mimeTypes: Record<string, string> = {
				txt: 'text/plain',
				html: 'text/html',
				css: 'text/css',
				yaml: 'application/x-yaml',
				yml: 'application/x-yaml',
				js: 'application/javascript',
				json: 'application/json',
				xml: 'application/xml',
				pdf: 'application/pdf',
				zip: 'application/zip',
				jpg: 'image/jpeg',
				jpeg: 'image/jpeg',
				png: 'image/png',
				gif: 'image/gif',
				svg: 'image/svg+xml',
				mp4: 'video/mp4',
				mp3: 'audio/mpeg',
			};
			contentType = ext ? mimeTypes[ext] : 'application/octet-stream';
		}

		// Upload using Bun.s3
		const s3Client = createS3Client({
			endpoint: bucket.endpoint,
			access_key: bucket.access_key,
			secret_key: bucket.secret_key,
			region: bucket.region,
		});

		// Upload using streaming. The S3ClientLike interface from
		// @agentuity/storage accepts a ReadableStream<Uint8Array> directly
		// for write() bodies; both backends handle streaming internally
		// (Bun via its native S3Client, Node via a counting passthrough
		// transform that reports exact bytes uploaded).
		let bytesUploaded = 0;

		await tui.spinner({
			message: `Uploading ${objectKey} to ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				bytesUploaded = await s3Client.write(objectKey, stream, {
					type: contentType,
				});
			},
		});

		if (!options.json) {
			tui.success(
				`Uploaded ${tui.bold(objectKey)} to ${tui.bold(args.name)} (${bytesUploaded} bytes)`
			);
		}

		return {
			success: true,
			bucket: args.name,
			filename: objectKey,
			size: bytesUploaded,
		};
	},
});
