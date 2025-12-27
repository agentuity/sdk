import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxDestroy } from '@agentuity/server';

const SandboxDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm', 'remove', 'destroy'],
	description: 'Delete a sandbox',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud sandbox delete abc123'),
			description: 'Delete a sandbox',
		},
		{
			command: getCommand('cloud sandbox rm abc123'),
			description: 'Delete using alias',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		response: SandboxDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, region, logger, orgId } = ctx;
		const started = Date.now();
		const client = createSandboxClient(logger, auth, region);

		await sandboxDestroy(client, { sandboxId: args.sandboxId, orgId });
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`deleted sandbox ${tui.bold(args.sandboxId)} in ${durationMs}ms`);
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			durationMs,
		};
	},
});

export default deleteSubcommand;
