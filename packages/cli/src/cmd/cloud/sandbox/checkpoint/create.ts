import { z } from 'zod';
import { createCommand } from '../../../../types.ts';
import * as tui from '../../../../tui.ts';
import { createSandboxClient } from '../util.ts';
import { getCommand } from '../../../../command-prefix.ts';
import { sandboxResolve, diskCheckpointCreate } from '@agentuity/server/index.ts';

const CheckpointCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	checkpointId: z.string().describe('Created checkpoint ID'),
	name: z.string().describe('Checkpoint name'),
	createdAt: z.string().describe('Checkpoint creation timestamp'),
	parent: z.string().describe('Parent checkpoint name'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const createSubcommand = createCommand({
	name: 'create',
	description: 'Create a disk checkpoint of the sandbox filesystem',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud sandbox checkpoint create sbx_abc123 my-checkpoint'),
			description: 'Create a disk checkpoint',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
			name: z.string().describe('Checkpoint name'),
		}),
		options: z.object({}),
		response: CheckpointCreateResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const started = Date.now();

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		const checkpoint = await diskCheckpointCreate(client, {
			sandboxId: args.sandboxId,
			name: args.name,
			orgId: sandboxInfo.orgId,
		});
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`created disk checkpoint ${tui.bold(checkpoint.id)} in ${durationMs}ms`);

			tui.table(
				[
					{
						ID: checkpoint.id,
						Name: checkpoint.name,
						'Created At': checkpoint.createdAt,
						Parent: checkpoint.parent || '-',
					},
				],
				['ID', 'Name', 'Created At', 'Parent'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			checkpointId: checkpoint.id,
			name: checkpoint.name,
			createdAt: checkpoint.createdAt,
			parent: checkpoint.parent,
			durationMs,
		};
	},
});

export default createSubcommand;
