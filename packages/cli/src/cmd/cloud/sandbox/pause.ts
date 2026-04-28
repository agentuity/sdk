import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient, resolveSandboxTarget } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxPause } from '@agentuity/server';

const SandboxPauseResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	sandboxId: z.string().describe('Sandbox ID'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
	terminatesAt: z
		.string()
		.optional()
		.describe(
			'ISO 8601 timestamp when sandbox will auto-terminate if not resumed (omitted if no paused timeout)'
		),
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

		const sandboxInfo = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			args.sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, sandboxInfo.region);

		const result = await sandboxPause(client, {
			sandboxId: args.sandboxId,
			orgId: sandboxInfo.orgId,
		});
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`paused sandbox ${tui.bold(args.sandboxId)} in ${durationMs}ms`);
			if (result.terminatesAt) {
				const terminateDate = new Date(result.terminatesAt);
				if (!Number.isNaN(terminateDate.getTime())) {
					tui.info(
						`this sandbox will auto-terminate at ${tui.bold(terminateDate.toLocaleString())} if not resumed`
					);
				} else {
					tui.info('this sandbox has a paused timeout and will auto-terminate if not resumed');
				}
			}
		}

		return {
			success: true,
			sandboxId: args.sandboxId,
			durationMs,
			terminatesAt: result.terminatesAt,
		};
	},
});

export default pauseSubcommand;
