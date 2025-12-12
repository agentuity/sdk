import { z } from 'zod';
import { basename } from 'path';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { createS3Client } from './utils';

export const uploadSubcommand = createSubcommand({
	name: 'upload',
	aliases: ['put'],
	description: 'Upload a file to storage bucket',
	tags: ['write', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
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
			command: `cat file.txt | ${getCommand('cloud storage upload')} my-bucket -`,
			description: 'Upload from stdin',
		},
	],
	schema: {
		args: z.object({
			name: z.string().describe('Bucket name'),
			filename: z.string().describe('File path to upload or "-" for STDIN'),
		}),
		options: z.object({
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

		// Prepare streaming upload - we don't buffer the entire file in memory
		let stream: ReadableStream<Uint8Array>;
		let actualFilename: string;

		if (args.filename === '-') {
			// Stream from STDIN
			stream = Bun.stdin.stream();
			actualFilename = 'stdin';
		} else {
			// Stream from file
			const file = Bun.file(args.filename);
			if (!(await file.exists())) {
				tui.fatal(`File not found: ${args.filename}`, ErrorCode.FILE_NOT_FOUND);
			}
			stream = file.stream();
			actualFilename = basename(args.filename);
		}

		// Auto-detect content type
		let contentType = opts.contentType;
		if (!contentType && args.filename !== '-') {
			const filename = basename(args.filename);
			const dotIndex = filename.lastIndexOf('.');
			const ext = dotIndex > 0 ? filename.substring(dotIndex + 1).toLowerCase() : undefined;
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

		// Upload using streaming - wrap the stream in a Response object
		// S3Client.write accepts Response which allows streaming without buffering in memory
		let bytesUploaded = 0;

		await tui.spinner({
			message: `Uploading ${actualFilename} to ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				bytesUploaded = await s3Client.write(actualFilename, new Response(stream), {
					type: contentType,
				});
			},
		});

		if (!options.json) {
			tui.success(
				`Uploaded ${tui.bold(actualFilename)} to ${tui.bold(args.name)} (${bytesUploaded} bytes)`
			);
		}

		return {
			success: true,
			bucket: args.name,
			filename: actualFilename,
			size: bytesUploaded,
		};
	},
});
