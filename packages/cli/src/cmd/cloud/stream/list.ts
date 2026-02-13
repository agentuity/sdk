import { z } from 'zod';
import { streamList, type StreamInfo } from '@agentuity/server';
import { StructuredError } from '@agentuity/core';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';

const StreamListError = StructuredError('StreamListError')<{
	namespace?: string;
	projectId?: string;
	orgId?: string;
}>();

const StreamInfoSchema = z.object({
	id: z.string().describe('Stream ID'),
	namespace: z.string().describe('Stream namespace'),
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
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud stream list'), description: 'List all streams' },
		{
			command: getCommand('cloud stream ls --size 50'),
			description: 'List 50 most recent streams',
		},
		{
			command: getCommand('cloud stream list --namespace agent-logs'),
			description: 'Filter by namespace',
		},
		{
			command: getCommand('cloud stream list --metadata type=export'),
			description: 'Filter by metadata',
		},
		{ command: getCommand('cloud stream ls --json'), description: 'Output as JSON' },
		{
			command: getCommand('cloud stream list --project-id proj_123'),
			description: 'Filter by project',
		},
		{
			command: getCommand('cloud stream list --org-id org_123'),
			description: 'Filter by organization',
		},
	],
	schema: {
		options: z.object({
			size: z.number().optional().describe('maximum number of streams to return (default: 100)'),
			offset: z.number().optional().describe('number of streams to skip for pagination'),
			namespace: z.string().optional().describe('filter by stream namespace'),
			name: z.string().optional().describe('Filter by stream name'),
			metadata: z
				.string()
				.optional()
				.describe('filter by metadata (format: key=value or key1=value1,key2=value2)'),
			projectId: z.string().optional().describe('filter by project ID'),
			orgId: z.string().optional().describe('filter by organization ID'),
			sort: z
				.enum(['name', 'created', 'updated', 'size'])
				.optional()
				.describe('field to sort by (default: created)'),
			direction: z.enum(['asc', 'desc']).optional().describe('sort direction (default: desc)'),
		}),
		response: ListStreamsResponseSchema,
	},
	webUrl: '/services/stream',

	async handler(ctx) {
		const { opts, options, apiClient, project } = ctx;

		if (opts?.orgId && opts?.projectId) {
			tui.fatal('--org-id and --project-id are mutually exclusive. Use one or the other.');
		}

		// Use explicit projectId flag; only fall back to project context when --org-id is not set
		const projectId = opts.projectId || (opts.orgId ? undefined : project?.projectId);

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

		try {
			const result = await streamList(apiClient, {
				limit: opts.size,
				offset: opts.offset,
				namespace: opts.namespace,
				name: opts.name,
				metadata: metadataFilter,
				projectId,
				orgId: opts.orgId,
				sort: opts.sort,
				direction: opts.direction,
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
				const tableData = result.streams.map((stream: StreamInfo) => {
					const sizeBytes = stream.sizeBytes ?? 0;
					const metadataStr =
						Object.keys(stream.metadata).length > 0 ? JSON.stringify(stream.metadata) : '-';
					return {
						Namespace: stream.namespace,
						ID: stream.id,
						Size: tui.formatBytes(sizeBytes),
						Metadata:
							metadataStr.length > 40 ? metadataStr.substring(0, 37) + '...' : metadataStr,
						URL: tui.link(stream.url),
					};
				});

				tui.table(tableData, [
					{ name: 'Namespace', alignment: 'left' },
					{ name: 'ID', alignment: 'left' },
					{ name: 'Size', alignment: 'right' },
					{ name: 'Metadata', alignment: 'left' },
					{ name: 'URL', alignment: 'left' },
				]);

				tui.info(`Total: ${result.total} ${tui.plural(result.total, 'stream', 'streams')}`);
			}

			return {
				streams: result.streams,
				total: result.total,
			};
		} catch (ex) {
			if (ex instanceof StreamListError) {
				throw ex;
			}
			throw new StreamListError({
				message: `Failed to list streams: ${ex}`,
				namespace: opts.namespace,
				projectId,
				orgId: opts.orgId,
			});
		}
	},
});

export default listSubcommand;
