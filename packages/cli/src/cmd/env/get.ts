import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { maskSecret } from '../../env-util';

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get an environment variable value',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key'),
		}),
		options: z.object({
			mask: z
				.boolean()
				.default(false)
				.describe('mask the value in output (default: true in TTY, false otherwise)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, apiClient, project } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching environment variables', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		// Look for the key in env
		const value = projectData.env?.[args.key];

		if (value === undefined) {
			tui.fatal(`Environment variable '${args.key}' not found`);
		}

		// Display the value, masked if requested
		if (process.stdout.isTTY) {
			if (opts?.mask) {
				tui.success(`${args.key}=${maskSecret(value)}`);
			} else {
				tui.success(`${args.key}=${value}`);
			}
		} else {
			if (opts?.mask) {
				console.log(`${args.key}=${maskSecret(value)}`);
			} else {
				console.log(`${args.key}=${value}`);
			}
		}
	},
});
