import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getSandboxRegion, createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxRmFile } from '@agentuity/server';

const RmFileResponseSchema = z.object({
	success: z.boolean(),
	path: z.string(),
});

export const rmSubcommand = createCommand({
	name: 'rm',
	description: 'Remove a file from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, org: true },
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
		const { args, options, auth, logger, orgId, config } = ctx;
		const region = await getSandboxRegion(logger, auth, config?.name, args.sandboxId, orgId);
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
