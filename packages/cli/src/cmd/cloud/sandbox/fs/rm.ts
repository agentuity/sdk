import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { sandboxRmFile, sandboxResolve } from '@agentuity/server';

const RmFileResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
	found: z.boolean(),
});

export const rmSubcommand = createCommand({
	name: 'rm',
	aliases: ['del', 'remove'],
	description: 'Remove a file from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox fs rm sbx_abc123 /path/to/file.txt'),
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

		const result = await sandboxRmFile(client, {
			sandboxId: args.sandboxId,
			path: args.path,
			orgId,
		});

		if (!options.json) {
			if (result.found) {
				tui.success(`Removed file: ${args.path}`);
			} else {
				tui.warning(`File not found: ${args.path} (already removed)`);
			}
		}

		return { success: true, path: args.path, found: result.found };
	},
});

export default rmSubcommand;
