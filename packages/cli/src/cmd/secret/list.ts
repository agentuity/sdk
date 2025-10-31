import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import { maskSecret } from '../../env-util';

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all secrets',
	requiresAuth: true,
	schema: {
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
			mask: z
				.boolean()
				.default(!!process.stdout.isTTY)
				.describe('mask the values in output (default: true in TTY for secrets)'),
		}),
	},

	async handler(ctx) {
		const { opts, config } = ctx;
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

		const secrets = project.secrets || {};

		if (Object.keys(secrets).length === 0) {
			tui.info('No secrets found');
			return;
		}

		// Display the secrets
		if (process.stdout.isTTY) {
			tui.newline();
			tui.success(`Secrets (${Object.keys(secrets).length}):`);
			tui.newline();
		}

		const sortedKeys = Object.keys(secrets).sort();
		// For secrets, masking is enabled by default in TTY (can be disabled with --no-mask)
		const shouldMask = opts?.mask !== false;
		for (const key of sortedKeys) {
			const value = secrets[key];
			const displayValue = shouldMask ? maskSecret(value) : value;
			if (process.stdout.isTTY) {
				console.log(`${tui.bold(key)}=${displayValue}`);
			} else {
				console.log(`${key}=${displayValue}`);
			}
		}
	},
});
