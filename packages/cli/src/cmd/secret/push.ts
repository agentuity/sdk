import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { findEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push secrets from local .env.production file to cloud',
	requiresAuth: true,
	requiresProject: true,

	async handler(ctx) {
		const { config, project, projectDir } = ctx;

		// Read local env file
		const envFilePath = await findEnvFile(projectDir);
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
				id: project.projectId,
				secrets: filteredSecrets,
			});
		});

		const count = Object.keys(filteredSecrets).length;
		tui.success(`Pushed ${count} secret${count !== 1 ? 's' : ''} to cloud`);
	},
});
