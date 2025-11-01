import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { findExistingEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push environment variables from local .env.production file to cloud',
	requires: { auth: true, project: true, apiClient: true },

	async handler(ctx) {
		const { apiClient, project, projectDir } = ctx;

		// Read local env file (prefer .env.production, fallback to .env)
		const envFilePath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No environment variables to push');
			return;
		}

		// Push to cloud
		await tui.spinner('Pushing environment variables to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				env: filteredEnv,
			});
		});

		const count = Object.keys(filteredEnv).length;
		tui.success(`Pushed ${count} environment variable${count !== 1 ? 's' : ''} to cloud`);
	},
});
