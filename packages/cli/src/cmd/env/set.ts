import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import {
	findEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	looksLikeSecret,
} from '../../env-util';
import { getCommand } from '../../command-prefix';

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set an environment variable',
	requiresAuth: true,
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key'),
			value: z.string().describe('the environment variable value'),
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

		// Detect if this looks like a secret
		if (looksLikeSecret(args.key, args.value)) {
			tui.warning(`The variable '${args.key}' looks like it should be a secret.`);
			tui.info(`Secrets should be stored using: ${getCommand('secret set <key> <value>')}`);
			tui.info('This keeps them more secure and properly masked in the cloud.');

			const response = await tui.confirm(
				'Do you still want to store this as a regular environment variable?',
				false
			);

			if (!response) {
				tui.info(
					`Cancelled. Use "${getCommand('secret set')}" to store this as a secret instead.`
				);
				return;
			}
		}

		// Load project config to get project ID
		const projectConfig = await loadProjectConfig(dir);
		if (!projectConfig) {
			tui.fatal(`No Agentuity project found in ${dir}. Missing agentuity.json`);
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Set in cloud
		await tui.spinner('Setting environment variable in cloud', () => {
			return projectEnvUpdate(client, {
				id: projectConfig.projectId,
				env: { [args.key]: args.value },
			});
		});

		// Update local .env.production file
		const envFilePath = await findEnvFile(dir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Environment variable '${args.key}' set successfully (cloud + ${envFilePath})`);
	},
});
