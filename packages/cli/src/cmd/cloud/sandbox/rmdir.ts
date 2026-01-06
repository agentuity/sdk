import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxRmDir } from '@agentuity/server';

const RmDirResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
});

export const rmdirSubcommand = createCommand({
	name: 'rmdir',
	description: 'Remove a directory from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox rmdir sbx_abc123 /path/to/dir'),
			description: 'Remove an empty directory from the sandbox',
		},
		{
			command: getCommand('cloud sandbox rmdir sbx_abc123 /path/to/dir -r'),
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
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		await sandboxRmDir(client, {
			sandboxId: args.sandboxId,
			path: args.path,
			recursive: opts.recursive,
			orgId,
		});

		if (!options.json) {
			tui.success(`Removed directory: ${args.path}`);
		}

		return { success: true, path: args.path };
	},
});

export default rmdirSubcommand;
