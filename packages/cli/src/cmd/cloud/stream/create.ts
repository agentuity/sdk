import { basename } from 'node:path';
import { z } from 'zod';
import { openReadStream, pathExists } from '../../../node-compat/fs.ts';
import { stdinWebStream } from '../../../node-compat/stdin.ts';
import * as tui from '../../../tui.ts';
import { createCommand } from '../../../types.ts';
import { createStorageAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { getDefaultRegion } from '../../../config.ts';

const StreamCreateResponseSchema = z.object({
	id: z.string().describe('Stream ID'),
	namespace: z.string().describe('Stream namespace'),
	url: z.string().describe('Public URL'),
	sizeBytes: z.number().describe('Size in bytes'),
	metadata: z.record(z.string(), z.string()).describe('Stream metadata'),
	expiresAt: z.string().optional().describe('Expiration timestamp'),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new stream and upload content',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true, org: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud stream create memory-share ./notes.md'),
			description: 'Create stream from file',
		},
		{
			command: getCommand(
				'cloud stream create memory-share ./data.json --content-type application/json'
			),
			description: 'Create stream with explicit content type',
		},
		{
			command: `cat summary.md | ${getCommand('cloud stream create memory-share -')}`,
			description: 'Create stream from stdin',
		},
		{
			command: getCommand('cloud stream create memory-share ./notes.md --ttl 3600'),
			description: 'Create stream with 1 hour TTL',
		},
		{
			command: getCommand(
				'cloud stream create memory-share ./notes.md --metadata type=summary,source=session'
			),
			description: 'Create stream with metadata',
		},
		{
			command: getCommand('cloud stream create memory-share ./large.json --compress'),
			description: 'Create compressed stream',
		},
	],
	schema: {
		args: z.object({
			namespace: z.string().min(1).max(254).describe('Stream namespace (1-254 characters)'),
			filename: z.string().describe('File path to upload or "-" for STDIN'),
		}),
		options: z.object({
			metadata: z
				.string()
				.optional()
				.describe('Metadata key=value pairs (comma-separated: key1=value1,key2=value2)'),
			contentType: z
				.string()
				.optional()
				.describe('Content type (auto-detected from extension if not provided)'),
			compress: z.boolean().optional().describe('Enable gzip compression'),
			ttl: z.coerce
				.number()
				.optional()
				.describe('TTL in seconds (60-7776000, or 0/null for never expires)'),
		}),
		response: StreamCreateResponseSchema,
	},
	webUrl: '/services/stream',

	async handler(ctx) {
		const { args, opts, options, config } = ctx;
		const started = Date.now();

		// Resolve region from config if not provided
		const region = ctx.region ?? (await getDefaultRegion(config?.name, config));
		const storage = await createStorageAdapter({ ...ctx, region });

		// Parse metadata if provided
		let metadata: Record<string, string> | undefined;
		if (opts.metadata) {
			const validPairs: Record<string, string> = {};
			const malformed: string[] = [];
			const pairs = opts.metadata.split(',');

			for (const pair of pairs) {
				const trimmedPair = pair.trim();
				if (!trimmedPair) continue;

				const firstEqualIdx = trimmedPair.indexOf('=');
				if (firstEqualIdx === -1) {
					malformed.push(trimmedPair);
					continue;
				}

				const key = trimmedPair.substring(0, firstEqualIdx).trim();
				const value = trimmedPair.substring(firstEqualIdx + 1).trim();

				if (!key || !value) {
					malformed.push(trimmedPair);
					continue;
				}

				validPairs[key] = value;
			}

			if (malformed.length > 0) {
				ctx.logger.warn(`Skipping malformed metadata pairs: ${malformed.join(', ')}`);
			}

			if (Object.keys(validPairs).length > 0) {
				metadata = validPairs;
			}
		}

		// Determine content type
		let contentType = opts.contentType;
		if (!contentType) {
			// Auto-detect from filename extension
			const filename = args.filename === '-' ? 'stdin' : args.filename;
			const dotIndex = filename.lastIndexOf('.');
			const ext = dotIndex > 0 ? filename.substring(dotIndex + 1).toLowerCase() : undefined;
			// Text-based types should include charset=utf-8 for proper browser rendering
			const mimeTypes: Record<string, string> = {
				txt: 'text/plain; charset=utf-8',
				md: 'text/markdown; charset=utf-8',
				html: 'text/html; charset=utf-8',
				css: 'text/css; charset=utf-8',
				yaml: 'application/x-yaml; charset=utf-8',
				yml: 'application/x-yaml; charset=utf-8',
				js: 'application/javascript; charset=utf-8',
				ts: 'application/typescript; charset=utf-8',
				json: 'application/json; charset=utf-8',
				xml: 'application/xml; charset=utf-8',
				pdf: 'application/pdf',
				zip: 'application/zip',
				jpg: 'image/jpeg',
				jpeg: 'image/jpeg',
				png: 'image/png',
				gif: 'image/gif',
				svg: 'image/svg+xml; charset=utf-8',
				mp4: 'video/mp4',
				mp3: 'audio/mpeg',
			};
			contentType = ext ? mimeTypes[ext] : 'application/octet-stream';
		}

		// Create the stream
		const stream = await storage.create(args.namespace, {
			metadata,
			contentType,
			compress: opts.compress ? true : undefined,
			ttl: opts.ttl,
		});

		// Read and write content
		let inputStream: ReadableStream<Uint8Array>;

		if (args.filename === '-') {
			// Stream from STDIN
			inputStream = stdinWebStream();
		} else {
			// Stream from file
			if (!(await pathExists(args.filename))) {
				tui.fatal(`File not found: ${args.filename}`);
			}
			inputStream = openReadStream(args.filename);
		}

		// Write content to stream in chunks
		const reader = inputStream.getReader();
		const MAX_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB max per write

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				// If chunk is larger than 5MB, split it
				if (value.length > MAX_CHUNK_SIZE) {
					let offset = 0;
					while (offset < value.length) {
						const chunk = value.slice(offset, offset + MAX_CHUNK_SIZE);
						await stream.write(chunk);
						offset += MAX_CHUNK_SIZE;
					}
				} else {
					await stream.write(value);
				}
			}
		} finally {
			reader.releaseLock();
		}

		// Close the stream
		await stream.close();

		const durationMs = Date.now() - started;
		const sizeBytes = stream.bytesWritten;

		// Get stream info to retrieve expiresAt
		let expiresAt: string | undefined;
		try {
			const info = await storage.get(stream.id);
			expiresAt = info.expiresAt ?? undefined;
		} catch {
			// expiresAt is optional, ignore errors
		}

		if (!options.json) {
			const sourceLabel = args.filename === '-' ? 'stdin' : basename(args.filename);
			console.log(`Namespace: ${tui.bold(args.namespace)}`);
			console.log(`ID:        ${stream.id}`);
			console.log(`Size:      ${tui.formatBytes(sizeBytes)}`);
			console.log(`URL:       ${tui.link(stream.url)}`);
			if (expiresAt) {
				console.log(`Expires:   ${expiresAt}`);
			}
			if (metadata && Object.keys(metadata).length > 0) {
				console.log(`Metadata:`);
				for (const [key, value] of Object.entries(metadata)) {
					console.log(`  ${key}: ${value}`);
				}
			}
			if (opts.compress) {
				console.log(`Compressed: yes`);
			}
			tui.success(`created stream from ${sourceLabel} in ${durationMs.toFixed(1)}ms`);
		}

		return {
			id: stream.id,
			namespace: args.namespace,
			url: stream.url,
			sizeBytes,
			metadata: metadata ?? {},
			expiresAt,
		};
	},
});

export default createSubcommand;
