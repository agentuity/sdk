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
		`${getCommand('cloud storage upload')} my-bucket file.txt`,
		`${getCommand('cloud storage put')} my-bucket file.txt --content-type text/plain`,
		`cat file.txt | ${getCommand('cloud storage upload')} my-bucket -`,
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
		const { logger, args, opts, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

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

		// Read file content
		let fileContent: Buffer;
		let actualFilename: string;

		if (args.filename === '-') {
			// Read from STDIN
			const chunks: Buffer[] = [];
			for await (const chunk of Bun.stdin.stream()) {
				chunks.push(Buffer.from(chunk));
			}
			fileContent = Buffer.concat(chunks);
			actualFilename = 'stdin';
		} else {
			// Read from file
			const file = Bun.file(args.filename);
			if (!(await file.exists())) {
				tui.fatal(`File not found: ${args.filename}`, ErrorCode.FILE_NOT_FOUND);
			}
			fileContent = Buffer.from(await file.arrayBuffer());
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

		await tui.spinner({
			message: `Uploading ${actualFilename} to ${args.name}`,
			clearOnSuccess: true,
			callback: async () => {
				await s3Client.write(actualFilename, fileContent, {
					type: contentType,
				});
			},
		});

		if (!options.json) {
			tui.success(
				`Uploaded ${tui.bold(actualFilename)} to ${tui.bold(args.name)} (${fileContent.length} bytes)`
			);
		}

		return {
			success: true,
			bucket: args.name,
			filename: actualFilename,
			size: fileContent.length,
		};
	},
});
