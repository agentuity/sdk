import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createSandboxClient } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';
import { sandboxResolve, diskCheckpointDelete } from '@agentuity/server/index.ts';

const CheckpointDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	checkpointId: z.string().describe('Deleted checkpoint ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	message: z.string().optional().describe('Status message'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove'],
	description: 'Delete a disk checkpoint',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox checkpoint delete sbx_abc123 ckpt_def456'),
			description: 'Delete a disk checkpoint',
		},
		{
			command: getCommand('cloud sandbox checkpoint delete sbx_abc123 ckpt_def456 --confirm'),
			description: 'Delete without confirmation prompt',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			checkpointId: z.string().describe('Checkpoint ID or name'),
		}),
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: CheckpointDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options, opts, auth, logger, apiClient } = ctx;

		if (!opts.confirm) {
			const confirmed = await tui.confirm(
				`Delete disk checkpoint "${args.checkpointId}" from sandbox "${args.sandboxId}"?`,
				false
			);
			if (!confirmed) {
				logger.info('Cancelled');
				return {
					success: false,
					sandboxId: args.sandboxId,
					checkpointId: args.checkpointId,
					durationMs: 0,
					message: 'Cancelled',
				};
			}
		}

		const started = Date.now();

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		await diskCheckpointDelete(client, {
			sandboxId: args.sandboxId,
			checkpointId: args.checkpointId,
			orgId: sandboxInfo.orgId,
		});
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(
				`deleted disk checkpoint ${tui.bold(args.checkpointId)} from sandbox ${tui.bold(args.sandboxId)} in ${durationMs}ms`
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

export default deleteSubcommand;
