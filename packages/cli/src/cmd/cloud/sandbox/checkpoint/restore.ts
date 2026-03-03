import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createSandboxClient } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';
import { sandboxResolve, diskCheckpointRestore } from '@agentuity/server/index.ts';

const CheckpointRestoreResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	checkpointId: z.string().describe('Restored checkpoint ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const restoreSubcommand = createCommand({
	name: 'restore',
	description: 'Restore a sandbox to a disk checkpoint',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud sandbox checkpoint restore sbx_abc123 ckpt_def456'),
			description: 'Restore a sandbox to a checkpoint by ID',
		},
		{
			command: getCommand('cloud sandbox checkpoint restore sbx_abc123 my-checkpoint'),
			description: 'Restore a sandbox to a checkpoint by name',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			checkpointId: z.string().describe('Checkpoint ID or name'),
		}),
		options: z.object({}),
		response: CheckpointRestoreResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const started = Date.now();

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		await diskCheckpointRestore(client, {
			sandboxId: args.sandboxId,
			checkpointId: args.checkpointId,
			orgId: sandboxInfo.orgId,
		});
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(
				`restored sandbox ${tui.bold(args.sandboxId)} to checkpoint ${tui.bold(args.checkpointId)} in ${durationMs}ms`
			);
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			checkpointId: args.checkpointId,
			durationMs,
		};
	},
});

export default restoreSubcommand;
