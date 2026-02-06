import { z } from 'zod';
import { streamGet } from '@agentuity/server';
import { StructuredError } from '@agentuity/core';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';

const StreamGetError = StructuredError('StreamGetError')<{
	streamId?: string;
}>();
const StreamDownloadError = StructuredError('StreamDownloadError')<{
	statusCode?: number;
	statusText?: string;
}>();
const StreamReaderError = StructuredError('StreamReaderError');

const GetStreamResponseSchema = z.object({
	id: z.string().describe('Stream ID'),
	namespace: z.string().describe('Stream namespace'),
	metadata: z.record(z.string(), z.string()).describe('Stream metadata'),
	url: z.string().describe('Public URL'),
	sizeBytes: z.number().describe('Size in bytes'),
});

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get detailed information about a specific stream',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('stream get stream_abc123'),
			description: 'Get stream details',
		},
		{
			command: getCommand('stream get stream_abc123 --json'),
			description: 'Get stream as JSON',
		},
		{
			command: getCommand('stream get stream_abc123 --output stream.dat'),
			description: 'Download stream to file',
		},
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
	webUrl: (ctx) => `/services/stream/${encodeURIComponent(ctx.args.id)}`,

	async handler(ctx) {
		const { args, opts, options, apiClient } = ctx;
		const started = Date.now();

		try {
			// Get stream metadata using the new API
			const stream = await streamGet(apiClient, args.id);
			const durationMs = Date.now() - started;

			// If --output is specified, download the stream content
			if (opts.output) {
				const downloadStarted = Date.now();

				// Fetch the stream content from the URL
				const response = await fetch(stream.url);
				if (!response.ok) {
					throw new StreamDownloadError({
						message: `Failed to download stream: ${response.status} ${response.statusText}`,
						statusCode: response.status,
						statusText: response.statusText,
					});
				}

				const file = Bun.file(opts.output);
				const writer = file.writer();

				const reader = response.body?.getReader();
				if (!reader) {
					throw new StreamReaderError({ message: 'Failed to get stream reader' });
				}

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						writer.write(value);
					}
					await writer.end();
					const downloadDurationMs = Date.now() - downloadStarted;
					const stats = await Bun.file(opts.output).stat();
					tui.success(
						`downloaded ${tui.formatBytes(stats.size)} to ${opts.output} in ${downloadDurationMs.toFixed(1)}ms`
					);

					return {
						id: stream.id,
						namespace: stream.namespace ?? '',
						metadata: stream.metadata ?? {},
						url: stream.url ?? '',
						sizeBytes: stats.size,
					};
				} finally {
					reader.releaseLock();
				}
			}

			// Display metadata
			if (!options.json) {
				const sizeBytes = stream.sizeBytes ?? 0;

				console.log(`Namespace: ${tui.bold(stream.namespace ?? 'unknown')}`);
				console.log(`ID:        ${stream.id}`);
				console.log(`Size:      ${tui.formatBytes(sizeBytes)}`);
				console.log(`URL:       ${tui.link(stream.url ?? 'unknown')}`);
				if (stream.metadata && Object.keys(stream.metadata).length > 0) {
					console.log(`Metadata:`);
					for (const [key, value] of Object.entries(stream.metadata)) {
						console.log(`  ${key}: ${value}`);
					}
				}
				if (stream.completed !== undefined) {
					console.log(`Completed: ${stream.completed ? 'yes' : 'no'}`);
				}
				if (stream.expiresAt) {
					console.log(`Expires:   ${stream.expiresAt}`);
				}
				tui.success(`retrieved in ${durationMs.toFixed(1)}ms`);
			}

			return {
				id: stream.id,
				namespace: stream.namespace,
				metadata: stream.metadata,
				url: stream.url,
				sizeBytes: stream.sizeBytes,
			};
		} catch (ex) {
			if (
				ex instanceof StreamGetError ||
				ex instanceof StreamDownloadError ||
				ex instanceof StreamReaderError
			) {
				throw ex;
			}
			throw new StreamGetError({ message: `Failed to get stream: ${ex}`, streamId: args.id });
		}
	},
});

export default getSubcommand;
