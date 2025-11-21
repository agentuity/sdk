import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvDelete } from '@agentuity/server';
import { findEnvFile, readEnvFile, writeEnvFile, filterAgentuitySdkKeys } from '../../env-util';
import { getCommand } from '../../command-prefix';

const SecretDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Secret key name that was deleted'),
	path: z.string().describe('Local file path where secret was removed'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete a secret',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	examples: [getCommand('secret delete OLD_API_KEY'), getCommand('secret rm DATABASE_URL')],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().describe('the secret key to delete'),
		}),
		response: SecretDeleteResponseSchema,
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

		return {
			success: true,
			key: args.key,
			path: envFilePath,
		};
	},
});
