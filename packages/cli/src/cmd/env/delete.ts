import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvDelete } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
} from '../../env-util';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete an environment variable',
	requiresAuth: true,
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key to delete'),
		}),
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
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

		// Delete from cloud
		await tui.spinner('Deleting environment variable from cloud', () => {
			return projectEnvDelete(client, {
				id: projectConfig.projectId,
				env: [args.key],
			});
		});

		// Update local .env file (prefer .env.production, fallback to .env)
		const envFilePath = await findExistingEnvFile(dir);
		const currentEnv = await readEnvFile(envFilePath);
		delete currentEnv[args.key];

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(
			`Environment variable '${args.key}' deleted successfully (cloud + ${envFilePath})`
		);
	},
});
