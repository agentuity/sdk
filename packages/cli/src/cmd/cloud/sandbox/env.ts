import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxSetEnv } from '@agentuity/server';

export const envSubcommand = createCommand({
	name: 'env',
	description: 'Set or delete environment variables on a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox env sbx_abc123 MY_VAR=value'),
			description: 'Set an environment variable',
		},
		{
			command: getCommand('cloud sandbox env sbx_abc123 VAR1=value1 VAR2=value2'),
			description: 'Set multiple environment variables',
		},
		{
			command: getCommand('cloud sandbox env sbx_abc123 --delete MY_VAR'),
			description: 'Delete an environment variable',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			vars: z.array(z.string()).optional().describe('Environment variables (KEY=VALUE format)'),
		}),
		options: z.object({
			delete: z.array(z.string()).optional().describe('Environment variable names to delete'),
		}),
		aliases: {
			delete: ['d'],
		},
		response: z.object({
			success: z.boolean(),
			env: z.record(z.string(), z.string()),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;

		const client = createSandboxClient(logger, auth, region);

		const envMap: Record<string, string | null> = {};

		if (args.vars) {
			for (const varSpec of args.vars) {
				const eqIndex = varSpec.indexOf('=');
				if (eqIndex === -1) {
					logger.fatal(
						`Invalid environment variable format: ${varSpec}. Use KEY=VALUE format.`
					);
				}
				const key = varSpec.slice(0, eqIndex);
				const value = varSpec.slice(eqIndex + 1);
				envMap[key] = value;
			}
		}

		if (opts.delete) {
			for (const key of opts.delete) {
				envMap[key] = null;
			}
		}

		if (Object.keys(envMap).length === 0) {
			logger.fatal('No environment variables specified. Use KEY=VALUE or --delete KEY');
		}

		const result = await sandboxSetEnv(client, {
			sandboxId: args.sandboxId,
			env: envMap,
			orgId,
		});

		if (!options.json) {
			const setVars = Object.entries(envMap).filter(([_, v]) => v !== null);
			const deletedVars = Object.entries(envMap).filter(([_, v]) => v === null);

			if (setVars.length > 0) {
				tui.success(`Set ${setVars.length} environment variable(s)`);
			}
			if (deletedVars.length > 0) {
				tui.success(`Deleted ${deletedVars.length} environment variable(s)`);
			}

			if (Object.keys(result.env).length > 0) {
				console.log('\nCurrent environment:');
				for (const [key, value] of Object.entries(result.env)) {
					console.log(`  ${key}=${value}`);
				}
			}
		}

		return { success: true, env: result.env };
	},
});

export default envSubcommand;
