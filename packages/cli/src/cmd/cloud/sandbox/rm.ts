import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxRmFile, sandboxResolve } from '@agentuity/server';

const RmFileResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
});

export const rmSubcommand = createCommand({
	name: 'rm',
	description: 'Remove a file from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox rm sbx_abc123 /path/to/file.txt'),
			description: 'Remove a file from the sandbox',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			path: z.string().describe('Path to the file to remove'),
		}),
		options: z.object({}),
		response: RmFileResponseSchema,
	},

	async handler(ctx) {
		const { args, options, auth, logger, apiClient } = ctx;

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);

		await sandboxRmFile(client, {
			sandboxId: args.sandboxId,
			path: args.path,
			orgId,
		});

		if (!options.json) {
			tui.success(`Removed file: ${args.path}`);
		}

		return { success: true, path: args.path };
	},
});

export default rmSubcommand;
