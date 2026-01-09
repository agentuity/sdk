import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
	validateNoPublicSecrets,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvPushResponseSchema = z.object({
	success: z.boolean().describe('Whether push succeeded'),
	pushed: z.number().describe('Number of items pushed'),
	envCount: z.number().describe('Number of env vars pushed'),
	secretCount: z.number().describe('Number of secrets pushed'),
	source: z.string().describe('Source file path'),
});

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push environment variables and secrets from local .env file to cloud',
	tags: [
		'mutating',
		'updates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	idempotent: true,
	examples: [{ command: getCommand('env push'), description: 'Push all variables to cloud' }],
	requires: { auth: true, project: true, apiClient: true },
	prerequisites: ['env set'],
	schema: {
		response: EnvPushResponseSchema,
	},

	async handler(ctx) {
		const { apiClient, project, projectDir } = ctx;

		// Read local env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out reserved AGENTUITY_ prefixed keys
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No variables to push');
			return {
				success: false,
				pushed: 0,
				envCount: 0,
				secretCount: 0,
				source: envFilePath,
			};
		}

		// Split into env and secrets based on key naming conventions
		const { env, secrets } = splitEnvAndSecrets(filteredEnv);

		// Check for any public vars that would have been treated as secrets
		const publicSecretKeys = validateNoPublicSecrets(secrets);
		if (publicSecretKeys.length > 0) {
			tui.warning(
				`Moving public variables to env: ${publicSecretKeys.join(', ')} (these are exposed to the frontend)`
			);
			for (const key of publicSecretKeys) {
				delete secrets[key];
				env[key] = filteredEnv[key];
			}
		}

		// Push to cloud
		await tui.spinner('Pushing variables to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				env,
				secrets,
			});
		});

		const envCount = Object.keys(env).length;
		const secretCount = Object.keys(secrets).length;
		const totalCount = envCount + secretCount;

		tui.success(
			`Pushed ${totalCount} variable${totalCount !== 1 ? 's' : ''} to cloud (${envCount} env, ${secretCount} secret${secretCount !== 1 ? 's' : ''})`
		);

		return {
			success: true,
			pushed: totalCount,
			envCount,
			secretCount,
			source: envFilePath,
		};
	},
});
