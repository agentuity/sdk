import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import { findEnvFile, readEnvFile, writeEnvFile, filterAgentuitySdkKeys } from '../../env-util';

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set a secret',
	requiresAuth: true,
	schema: {
		args: z.object({
			key: z.string().min(1, 'key must not be empty').describe('the secret key'),
			value: z.string().min(1, 'value must not be empty').describe('the secret value'),
		}),
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, config } = ctx;
		const dir = opts?.dir ?? process.cwd();

		// Validate key doesn't start with AGENTUITY_
		if (args.key.startsWith('AGENTUITY_')) {
			tui.fatal('Cannot set AGENTUITY_ prefixed variables. These are reserved for system use.');
		}

		// Load project config to get project ID
		const projectConfig = await loadProjectConfig(dir);
		if (!projectConfig) {
			tui.fatal(`No Agentuity project found in ${dir}. Missing agentuity.json`);
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Set in cloud (using secrets field)
		await tui.spinner('Setting secret in cloud', () => {
			return projectEnvUpdate(client, {
				id: projectConfig.projectId,
				secrets: { [args.key]: args.value },
			});
		});

		// Update local .env.production file
		const envFilePath = await findEnvFile(dir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Secret '${args.key}' set successfully (cloud + ${envFilePath})`);
	},
});
