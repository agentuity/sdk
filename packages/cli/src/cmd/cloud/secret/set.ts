import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	isPublicVarKey,
	isReservedAgentuityKey,
	PUBLIC_VAR_PREFIXES,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const SecretSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Secret key name'),
	path: z.string().describe('Local file path where secret was saved'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set a secret',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	examples: [
		{
			command: getCommand('secret set DATABASE_URL "postgres://user:pass@host:5432/db"'),
			description: 'Set the DATABASE_URL environment secret',
		},
		{
			command: getCommand('secret set STRIPE_SECRET_KEY "sk_live_..."'),
			description: 'Set the STRIPE_SECRET_KEY environment secret',
		},
	],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().min(1, 'key must not be empty').describe('the secret key'),
			value: z.string().min(1, 'value must not be empty').describe('the secret value'),
		}),
		response: SecretSetResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

		// Validate key doesn't start with reserved AGENTUITY_ prefix
		if (isReservedAgentuityKey(args.key)) {
			tui.fatal('Cannot set AGENTUITY_ prefixed variables. These are reserved for system use.');
		}

		// Validate key is not a public variable (these cannot be secrets)
		if (isPublicVarKey(args.key)) {
			tui.fatal(
				`Cannot set public variables as secrets. Keys with prefixes (${PUBLIC_VAR_PREFIXES.join(', ')}) are exposed to the frontend. Use 'agentuity env set' instead.`
			);
		}

		// Set in cloud (using secrets field)
		await tui.spinner('Setting secret in cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				secrets: { [args.key]: args.value },
			});
		});

		// Update local .env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(`Secret '${args.key}' set successfully (cloud + ${envFilePath})`);

		return {
			success: true,
			key: args.key,
			path: envFilePath,
		};
	},
});
