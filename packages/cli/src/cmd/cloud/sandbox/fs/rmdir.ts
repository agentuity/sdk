import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient } from '../util';
import { getCommand } from '../../../../command-prefix';
import { sandboxRmDir, sandboxResolve } from '@agentuity/server';

const RmDirResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
	found: z.boolean(),
});

export const rmdirSubcommand = createCommand({
	name: 'rmdir',
	description: 'Remove a directory from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox fs rmdir sbx_abc123 /path/to/dir'),
			description: 'Remove an empty directory from the sandbox',
		},
		{
			command: getCommand('cloud sandbox fs rmdir sbx_abc123 /path/to/dir -r'),
			description: 'Remove a directory and all its contents recursively',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			path: z.string().describe('Path to the directory to remove'),
		}),
		options: z.object({
			recursive: z
				.boolean()
				.default(false)
				.optional()
				.describe('Remove directory and all contents'),
		}),
		aliases: {
			recursive: ['r'],
		},
		response: RmDirResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);

		const result = await sandboxRmDir(client, {
			sandboxId: args.sandboxId,
			path: args.path,
			recursive: opts.recursive,
			orgId,
		});

		if (!options.json) {
			if (result.found) {
				tui.success(`Removed directory: ${args.path}`);
			} else {
				tui.warning(`Directory not found: ${args.path} (already removed)`);
			}
		}

		return { success: true, path: args.path, found: result.found };
	},
});

export default rmdirSubcommand;
