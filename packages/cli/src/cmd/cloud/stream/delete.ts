import { z } from 'zod';
import { streamGet } from '@agentuity/server';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapterForOrg } from './util';
import { getCommand } from '../../../command-prefix';
const DeleteStreamResponseSchema = z.object({
	id: z.string().describe('Stream ID'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'del', 'remove', 'terminate'],
	description: 'Delete a stream by ID (soft delete)',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	examples: [
		{ command: getCommand('stream delete stream-id-123'), description: 'Delete a stream' },
		{
			command: getCommand('stream rm stream-id-456'),
			description: 'Delete stream (using alias)',
		},
		{
			command: getCommand('stream del stream-id-789'),
			description: 'Delete stream (using alias)',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the stream ID to delete'),
		}),
		response: DeleteStreamResponseSchema,
	},

	async handler(ctx) {
		const { args, options, logger, auth, apiClient } = ctx;
		const started = Date.now();

		if (!apiClient) {
			tui.fatal('API client is required for stream delete');
		}

		// Look up the stream to get its org and region
		const streamInfo = await streamGet(apiClient, args.id);

		// Extract region from the stream URL (e.g., https://streams-use.agentuity.cloud/...)
		let region = 'usc'; // default
		const urlMatch = streamInfo.url.match(/https:\/\/streams-([^.]+)\.agentuity\.cloud/);
		if (urlMatch?.[1]) {
			region = urlMatch[1];
		} else if (streamInfo.url.includes('streams.agentuity.io')) {
			region = 'local';
		}

		// Use the stream's orgId for auth
		const storage = createStorageAdapterForOrg({
			logger,
			auth,
			region,
			orgId: streamInfo.orgId,
		});

		await storage.delete(args.id);

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`deleted stream ${args.id} in ${durationMs.toFixed(1)}ms`);
		}

		return {
			id: args.id,
		};
	},
});

export default deleteSubcommand;
