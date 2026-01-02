import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { findExistingEnvFile, readEnvFile, filterAgentuitySdkKeys } from '../../../env-util';
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

		// Filter out AGENTUITY_ prefixed keys (don't push SDK keys)
		const filteredSecrets = filterAgentuitySdkKeys(localEnv);

		if (Object.keys(filteredSecrets).length === 0) {
			tui.warning('No secrets to push');
			return {
				success: false,
				pushed: 0,
				source: envFilePath,
			};
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

		return {
			success: true,
			pushed: count,
			source: envFilePath,
		};
	},
});
