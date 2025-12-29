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
	message: z.string().optional().describe('Status message'),
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
		{
			command: getCommand('cloud sandbox rm abc123 --confirm'),
			description: 'Delete without confirmation prompt',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({
			confirm: z
				.boolean()
				.optional()
				.default(false)
				.describe('Skip confirmation prompt'),
		}),
		response: SandboxDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, options, opts, auth, region, logger, orgId } = ctx;

		if (!opts.confirm) {
			const confirmed = await tui.confirm(`Delete sandbox "${args.sandboxId}"?`, false);
			if (!confirmed) {
				logger.info('Cancelled');
				return {
					success: false,
					sandboxId: args.sandboxId,
					durationMs: 0,
					message: 'Cancelled',
				};
			}
		}

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
