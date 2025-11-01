import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { findEnvFile, readEnvFile, writeEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set a secret',
	requiresAuth: true,
	requiresProject: true,
	schema: {
		args: z.object({
			key: z.string().min(1, 'key must not be empty').describe('the secret key'),
			value: z.string().min(1, 'value must not be empty').describe('the secret value'),
		}),
	},

	async handler(ctx) {
		const { args, config, project, projectDir } = ctx;

		// Validate key doesn't start with AGENTUITY_
		if (args.key.startsWith('AGENTUITY_')) {
			tui.fatal('Cannot set AGENTUITY_ prefixed variables. These are reserved for system use.');
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Set in cloud (using secrets field)
		await tui.spinner('Setting secret in cloud', () => {
			return projectEnvUpdate(client, {
				id: project.projectId,
				secrets: { [args.key]: args.value },
			});
		});

		// Update local .env.production file
		const envFilePath = await findEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Secret '${args.key}' set successfully (cloud + ${envFilePath})`);
	},
});
