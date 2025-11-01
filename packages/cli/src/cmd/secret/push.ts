import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { findEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push secrets from local .env.production file to cloud',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,

	async handler(ctx) {
		const { apiClient, project, projectDir } = ctx;

		// Read local env file
		const envFilePath = await findEnvFile(projectDir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredSecrets = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredSecrets).length === 0) {
			tui.warning('No secrets to push');
			return;
		}

		// Push to cloud (using secrets field)
		await tui.spinner('Pushing secrets to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				secrets: filteredSecrets,
			});
		});

		const count = Object.keys(filteredSecrets).length;
		tui.success(`Pushed ${count} secret${count !== 1 ? 's' : ''} to cloud`);
	},
});
