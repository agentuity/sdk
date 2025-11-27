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

const StreamInfoSchema = z.object({
	id: z.string().describe('Stream ID'),
	name: z.string().describe('Stream name'),
	metadata: z.record(z.string(), z.string()).describe('Stream metadata'),
	url: z.string().describe('Public URL'),
	sizeBytes: z.number().describe('Size in bytes'),
});

const ListStreamsResponseSchema = z.object({
	streams: z.array(StreamInfoSchema).describe('List of streams'),
	total: z.number().describe('Total count of matching streams'),
});

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List recent streams with optional filtering',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, project: true },
	idempotent: true,
	examples: [
		`${getCommand('stream list')} - List all streams`,
		`${getCommand('stream ls --size 50')} - List 50 most recent streams`,
		`${getCommand('stream list --name agent-logs')} - Filter by name`,
		`${getCommand('stream list --metadata type=export')} - Filter by metadata`,
		`${getCommand('stream ls --json')} - Output as JSON`,
	],
	schema: {
		options: z.object({
			size: z.number().optional().describe('maximum number of streams to return (default: 100)'),
			offset: z.number().optional().describe('number of streams to skip for pagination'),
			name: z.string().optional().describe('filter by stream name'),
			metadata: z
				.string()
				.optional()
				.describe('filter by metadata (format: key=value or key1=value1,key2=value2)'),
		}),
		response: ListStreamsResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const storage = await createStorageAdapter(ctx);

		// Parse metadata filter if provided
		let metadataFilter: Record<string, string> | undefined;
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
				metadataFilter = validPairs;
			}
		}

		const result = await storage.list({
			limit: opts.size,
			offset: opts.offset,
			name: opts.name,
			metadata: metadataFilter,
		});

		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
			return {
				streams: result.streams,
				total: result.total,
			};
		}

		if (result.streams.length === 0) {
			tui.info('No streams found');
		} else {
			const tableData = result.streams.map((stream) => {
				const sizeBytes = stream.sizeBytes ?? 0;
				const metadataStr =
					Object.keys(stream.metadata).length > 0 ? JSON.stringify(stream.metadata) : '-';
				return {
					Name: stream.name,
					ID: stream.id,
					Size: formatBytes(sizeBytes),
					Metadata:
						metadataStr.length > 40 ? metadataStr.substring(0, 37) + '...' : metadataStr,
					URL: tui.link(stream.url),
				};
			});

			tui.table(tableData, [
				{ name: 'Name', alignment: 'left' },
				{ name: 'ID', alignment: 'left' },
				{ name: 'Size', alignment: 'right' },
				{ name: 'Metadata', alignment: 'left' },
				{ name: 'URL', alignment: 'left' },
			]);

			tui.info(`Total: ${result.total} stream(s)`);
		}

		return {
			streams: result.streams,
			total: result.total,
		};
	},
});

export default listSubcommand;
