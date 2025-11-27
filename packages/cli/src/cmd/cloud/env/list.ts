import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';

const EnvListResponseSchema = z.record(
	z.string(),
	z.string().describe('Environment variable value')
);

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all environment variables',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	examples: [getCommand('env list'), getCommand('env list --mask')],
	requires: { auth: true, project: true, apiClient: true },
	idempotent: true,
	schema: {
		options: z.object({
			mask: z
				.boolean()
				.default(false)
				.describe('mask the values in output (default: false for env vars)'),
		}),
		response: EnvListResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, options } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching environment variables', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		const env = projectData.env || {};

		// Skip TUI output in JSON mode
		if (!options.json) {
			if (Object.keys(env).length === 0) {
				tui.info('No environment variables found');
			} else {
				// Display the variables
				if (process.stdout.isTTY) {
					tui.newline();
					tui.info(`Environment Variables (${Object.keys(env).length}):`);
					tui.newline();
				}

				const sortedKeys = Object.keys(env).sort();
				// For env vars, masking should be explicitly opted-in (default false)
				const shouldMask = opts?.mask === true;
				for (const key of sortedKeys) {
					const value = env[key];
					const displayValue = shouldMask ? tui.maskSecret(value) : value;
					if (process.stdout.isTTY) {
						console.log(`${tui.bold(key)}=${displayValue}`);
					} else {
						console.log(`${key}=${displayValue}`);
					}
				}
			}
		}

		return env;
	},
});
