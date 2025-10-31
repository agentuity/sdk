import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import { maskSecret } from '../../env-util';

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get a secret value',
	requiresAuth: true,
	schema: {
		args: z.object({
			key: z.string().describe('the secret key'),
		}),
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
			mask: z
				.boolean()
				.default(!!process.stdout.isTTY)
				.describe('mask the value in output (default: true in TTY, false otherwise)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, config } = ctx;
		const dir = opts?.dir ?? process.cwd();

		// Load project config to get project ID
		const projectConfig = await loadProjectConfig(dir);
		if (!projectConfig) {
			tui.fatal(`No Agentuity project found in ${dir}. Missing agentuity.json`);
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Fetch project with unmasked secrets
		const project = await tui.spinner('Fetching secrets', () => {
			return projectGet(client, { id: projectConfig.projectId, mask: false });
		});

		// Look for the key in secrets
		const value = project.secrets?.[args.key];

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
