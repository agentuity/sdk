import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import { findExistingEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push environment variables from local .env.production file to cloud',
	requiresAuth: true,
	schema: {
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
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

		// Read local env file (prefer .env.production, fallback to .env)
		const envFilePath = await findExistingEnvFile(dir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No environment variables to push');
			return;
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Push to cloud
		await tui.spinner('Pushing environment variables to cloud', () => {
			return projectEnvUpdate(client, {
				id: projectConfig.projectId,
				env: filteredEnv,
			});
		});

		const count = Object.keys(filteredEnv).length;
		tui.success(`Pushed ${count} environment variable${count !== 1 ? 's' : ''} to cloud`);
	},
});
