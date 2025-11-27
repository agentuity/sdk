import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

const DeleteStreamResponseSchema = z.object({
	id: z.string().describe('Stream ID'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm'],
	description: 'Delete a stream by ID (soft delete)',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, project: true },
	examples: [
		`${getCommand('stream delete stream-id-123')} - Delete a stream`,
		`${getCommand('stream rm stream-id-456')} - Delete stream (using alias)`,
		`${getCommand('stream del stream-id-789')} - Delete stream (using alias)`,
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the stream ID to delete'),
		}),
		response: DeleteStreamResponseSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

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
