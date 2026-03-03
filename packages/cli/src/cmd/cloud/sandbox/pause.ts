import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxPause, sandboxResolve } from '@agentuity/server';

const SandboxPauseResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const pauseSubcommand = createCommand({
	name: 'pause',
	aliases: ['hibernate', 'suspend'],
	description: 'Pause a running sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud sandbox pause sbx_abc123'),
			description: 'Pause a sandbox',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({}),
		response: SandboxPauseResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const started = Date.now();

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		await sandboxPause(client, { sandboxId: args.sandboxId, orgId: sandboxInfo.orgId });
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`paused sandbox ${tui.bold(args.sandboxId)} in ${durationMs}ms`);
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			durationMs,
		};
	},
});

export default pauseSubcommand;
