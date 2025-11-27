import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const GetStreamResponseSchema = z.object({
	id: z.string().describe('Stream ID'),
	name: z.string().describe('Stream name'),
	metadata: z.record(z.string(), z.string()).describe('Stream metadata'),
	url: z.string().describe('Public URL'),
	sizeBytes: z.number().describe('Size in bytes'),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get detailed information about a specific stream',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('stream get stream-id-123')} - Get stream details`,
		`${getCommand('stream get stream-id-123 --json')} - Get stream as JSON`,
		`${getCommand('stream get stream-id-123 --output stream.dat')} - Download stream to file`,
		`${getCommand('stream get stream-id-123 -o stream.dat')} - Download stream (short flag)`,
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the stream ID'),
		}),
		options: z.object({
			output: z.string().optional().describe('download stream content to file'),
		}),
		response: GetStreamResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		// If --output is specified, download the stream content
		if (opts.output) {
			const readable = await storage.download(args.id);
			const file = Bun.file(opts.output);
			const writer = file.writer();

			const reader = readable.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					writer.write(value);
				}
				await writer.end();
				const durationMs = Date.now() - started;
				const stats = await Bun.file(opts.output).stat();
				tui.success(`downloaded ${formatBytes(stats.size)} to ${opts.output} in ${durationMs.toFixed(1)}ms`);
				
				// Fetch stream metadata to populate the response
				const stream = await storage.get(args.id);
				return {
					id: args.id,
					name: stream.name ?? '',
					metadata: stream.metadata ?? {},
					url: stream.url ?? '',
					sizeBytes: stats.size,
				};
			} finally {
				reader.releaseLock();
			}
		}

		// Otherwise, get metadata
		const stream = await storage.get(args.id);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (!stream) {
				tui.fatal(`Failed to retrieve stream metadata for ${args.id}`);
			}

			const sizeBytes = stream.sizeBytes ?? 0;

			console.log(`Name:     ${tui.bold(stream.name ?? 'unknown')}`);
			console.log(`ID:       ${stream.id}`);
			console.log(`Size:     ${formatBytes(sizeBytes)}`);
			console.log(`URL:      ${tui.link(stream.url ?? 'unknown')}`);
			if (stream.metadata && Object.keys(stream.metadata).length > 0) {
				console.log(`Metadata:`);
				for (const [key, value] of Object.entries(stream.metadata)) {
					console.log(`  ${key}: ${value}`);
				}
			}
			tui.success(`retrieved in ${durationMs.toFixed(1)}ms`);
		}

		return {
			id: stream.id,
			name: stream.name,
			metadata: stream.metadata,
			url: stream.url,
			sizeBytes: stream.sizeBytes,
		};
	},
});

export default getSubcommand;
