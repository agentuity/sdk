import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxMkDir } from '@agentuity/server';

const MkDirResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
});

export const mkdirSubcommand = createCommand({
	name: 'mkdir',
	description: 'Create a directory in a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox mkdir sbx_abc123 /path/to/dir'),
			description: 'Create a directory in the sandbox',
		},
		{
			command: getCommand('cloud sandbox mkdir sbx_abc123 /path/to/nested/dir -p'),
			description: 'Create nested directories recursively',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			path: z.string().describe('Path to the directory to create'),
		}),
		options: z.object({
			parents: z
				.boolean()
				.default(false)
				.optional()
				.describe('Create parent directories as needed'),
		}),
		aliases: {
			parents: ['p'],
		},
		response: MkDirResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		await sandboxMkDir(client, {
			sandboxId: args.sandboxId,
			path: args.path,
			recursive: opts.parents,
			orgId,
		});

		if (!options.json) {
			tui.success(`Created directory: ${args.path}`);
		}

		return { success: true, path: args.path };
	},
});

export default mkdirSubcommand;
