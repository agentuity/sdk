import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvDelete } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Environment variable key that was deleted'),
	path: z.string().describe('Local file path where env var was removed'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete an environment variable',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	examples: [getCommand('env delete OLD_FEATURE_FLAG'), getCommand('env rm PORT')],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key to delete'),
		}),
		response: EnvDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, project, projectDir, apiClient } = ctx;

		// Delete from cloud
		await tui.spinner('Deleting environment variable from cloud', () => {
			return projectEnvDelete(apiClient, {
				id: project.projectId,
				env: [args.key],
			});
		});

		// Update local .env file (prefer .env.production, fallback to .env)
		const envFilePath = await findExistingEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		delete currentEnv[args.key];

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(
			`Environment variable '${args.key}' deleted successfully (cloud + ${envFilePath})`
		);

		return {
			success: true,
			key: args.key,
			path: envFilePath,
		};
	},
});
