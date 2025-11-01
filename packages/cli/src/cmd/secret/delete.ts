import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvDelete } from '@agentuity/server';
import { findEnvFile, readEnvFile, writeEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete a secret',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,
	schema: {
		args: z.object({
			key: z.string().describe('the secret key to delete'),
		}),
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

		// Delete from cloud (using secrets field)
		await tui.spinner('Deleting secret from cloud', () => {
			return projectEnvDelete(apiClient, {
				id: project.projectId,
				secrets: [args.key],
			});
		});

		// Update local .env.production file
		const envFilePath = await findEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		delete currentEnv[args.key];

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Secret '${args.key}' deleted successfully (cloud + ${envFilePath})`);
	},
});
