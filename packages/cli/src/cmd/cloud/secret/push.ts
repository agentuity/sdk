import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	validateNoPublicSecrets,
	splitEnvAndSecrets,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const SecretPushResponseSchema = z.object({
	success: z.boolean().describe('Whether push succeeded'),
	pushed: z.number().describe('Number of items pushed'),
	source: z.string().describe('Source file path'),
});

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push secrets from local .env file to cloud',
	tags: [
		'mutating',
		'updates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	idempotent: true,
	examples: [{ command: getCommand('secret push'), description: 'Run push command' }],
	requires: { auth: true, project: true, apiClient: true },
	prerequisites: ['secret set'],
	schema: {
		response: SecretPushResponseSchema,
	},

	async handler(ctx) {
		const { apiClient, project, projectDir } = ctx;

		// Read local env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out reserved AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		// Split into env and secrets (public vars will be in env, not secrets)
		const { env, secrets } = splitEnvAndSecrets(filteredEnv);

		// Check for any public vars that would have been treated as secrets
		const publicSecretKeys = validateNoPublicSecrets(secrets);
		if (publicSecretKeys.length > 0) {
			tui.warning(
				`Skipping public variables: ${publicSecretKeys.join(', ')} (these are exposed to the frontend)`
			);
			for (const key of publicSecretKeys) {
				delete secrets[key];
				env[key] = filteredEnv[key];
			}
		}

		if (Object.keys(env).length === 0 && Object.keys(secrets).length === 0) {
			tui.warning('No secrets to push');
			return {
				success: false,
				pushed: 0,
				source: envFilePath,
			};
		}

		// Push to cloud
		await tui.spinner('Pushing secrets to cloud', () => {
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
			source: envFilePath,
		};
	},
});
