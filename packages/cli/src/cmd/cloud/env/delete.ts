import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvDelete, projectGet } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const EnvDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Variable key that was deleted'),
	path: z.string().describe('Local file path where variable was removed'),
	secret: z.boolean().describe('Whether a secret was deleted'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete an environment variable or secret',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	examples: [
		{ command: getCommand('env delete OLD_FEATURE_FLAG'), description: 'Delete variable' },
		{ command: getCommand('env rm API_KEY'), description: 'Delete a secret' },
	],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().describe('the variable or secret key to delete'),
		}),
		response: EnvDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, project, projectDir, apiClient } = ctx;

		// First, determine if this key exists in env or secrets
		const projectData = await tui.spinner('Checking variable', () => {
			return projectGet(apiClient, { id: project.projectId, mask: true });
		});

		const isSecret = projectData.secrets?.[args.key] !== undefined;
		const isEnv = projectData.env?.[args.key] !== undefined;

		if (!isSecret && !isEnv) {
			tui.fatal(`Variable '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// Delete from cloud using the correct field
		const label = isSecret ? 'secret' : 'environment variable';
		await tui.spinner(`Deleting ${label} from cloud`, () => {
			return projectEnvDelete(apiClient, {
				id: project.projectId,
				...(isSecret ? { secrets: [args.key] } : { env: [args.key] }),
			});
		});

		// Update local .env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		delete currentEnv[args.key];

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(
			`${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' deleted successfully (cloud + ${envFilePath})`
		);

		return {
			success: true,
			key: args.key,
			path: envFilePath,
			secret: isSecret,
		};
	},
});
