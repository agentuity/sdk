import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import { findEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push secrets from local .env.production file to cloud',
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

		// Read local env file
		const envFilePath = await findEnvFile(dir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredSecrets = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredSecrets).length === 0) {
			tui.warning('No secrets to push');
			return;
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Push to cloud (using secrets field)
		await tui.spinner('Pushing secrets to cloud', () => {
			return projectEnvUpdate(client, {
				id: projectConfig.projectId,
				secrets: filteredSecrets,
			});
		});

		const count = Object.keys(filteredSecrets).length;
		tui.success(`Pushed ${count} secret${count !== 1 ? 's' : ''} to cloud`);
	},
});
