import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxResume, sandboxResolve } from '@agentuity/server/index.ts';

const SandboxResumeResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const resumeSubcommand = createCommand({
	name: 'resume',
	aliases: ['wake', 'unpause'],
	description: 'Resume a paused sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		{
			command: getCommand('cloud sandbox resume sbx_abc123'),
			description: 'Resume a paused sandbox',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('Sandbox ID'),
		}),
		options: z.object({}),
		response: SandboxResumeResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		const started = Date.now();

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		await sandboxResume(client, { sandboxId: args.sandboxId, orgId: sandboxInfo.orgId });
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`resumed sandbox ${tui.bold(args.sandboxId)} in ${durationMs}ms`);
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			durationMs,
		};
	},
});

export default resumeSubcommand;
