import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	looksLikeSecret,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Environment variable key'),
	path: z.string().describe('Local file path where env var was saved'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set an environment variable',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, project: true, apiClient: true },
	examples: [
		getCommand('env set NODE_ENV production'),
		getCommand('env set PORT 3000'),
		getCommand('env set LOG_LEVEL debug'),
	],
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key'),
			value: z.string().describe('the environment variable value'),
		}),
		response: EnvSetResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

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
				return {
					success: false,
					key: args.key,
					path: '',
				};
			}
		}

		// Set in cloud
		await tui.spinner('Setting environment variable in cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				env: { [args.key]: args.value },
			});
		});

		// Update local .env.production file
		const envFilePath = await findEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Environment variable '${args.key}' set successfully (cloud + ${envFilePath})`);

		return {
			success: true,
			key: args.key,
			path: envFilePath,
		};
	},
});
