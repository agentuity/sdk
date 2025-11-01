import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { maskSecret } from '../../env-util';

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a secret value',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,
	schema: {
		args: z.object({
			key: z.string().describe('the secret key'),
		}),
		options: z.object({
			mask: z
				.boolean()
				.default(!!process.stdout.isTTY)
				.describe('mask the value in output (default: true in TTY, false otherwise)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, apiClient, project } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Fetching secrets', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		// Look for the key in secrets
		const value = projectData.secrets?.[args.key];

		if (value === undefined) {
			tui.fatal(`Secret '${args.key}' not found`);
		}

		if (process.stdout.isTTY) {
			// Display the value, masked by default
			if (opts?.mask) {
				tui.success(`${args.key}=${maskSecret(value)}`);
			} else {
				tui.success(`${args.key}=${value}`);
			}
		} else {
			// Display the value, masked by default
			if (opts?.mask) {
				console.log(`${args.key}=${maskSecret(value)}`);
			} else {
				console.log(`${args.key}=${value}`);
			}
		}
	},
});
