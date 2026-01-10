import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	looksLikeSecret,
	isReservedAgentuityKey,
	isPublicVarKey,
	PUBLIC_VAR_PREFIXES,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Environment variable key'),
	path: z.string().describe('Local file path where env var was saved'),
	secret: z.boolean().describe('Whether the value was stored as a secret'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set an environment variable or secret',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	requires: { auth: true, project: true, apiClient: true },
	examples: [
		{
			command: getCommand('env set NODE_ENV production'),
			description: 'Set environment variable',
		},
		{ command: getCommand('env set PORT 3000'), description: 'Set port number' },
		{
			command: getCommand('env set API_KEY "sk_..." --secret'),
			description: 'Set a secret value',
		},
	],
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key'),
			value: z.string().describe('the environment variable value'),
		}),
		options: z.object({
			secret: z
				.boolean()
				.default(false)
				.describe('store as a secret (encrypted and masked in UI)'),
		}),
		response: EnvSetResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, apiClient, project, projectDir } = ctx;
		let isSecret = opts?.secret ?? false;

		// Validate key doesn't start with reserved AGENTUITY_ prefix (except AGENTUITY_PUBLIC_)
		if (isReservedAgentuityKey(args.key)) {
			tui.fatal('Cannot set AGENTUITY_ prefixed variables. These are reserved for system use.');
		}

		// Validate public vars cannot be secrets
		if (isSecret && isPublicVarKey(args.key)) {
			tui.fatal(
				`Cannot set public variables as secrets. Keys with prefixes (${PUBLIC_VAR_PREFIXES.join(', ')}) are exposed to the frontend.`
			);
		}

		// Auto-detect if this looks like a secret and offer to store as secret
		if (!isSecret && looksLikeSecret(args.key, args.value)) {
			tui.warning(`The variable '${args.key}' looks like it should be a secret.`);

			const storeAsSecret = await tui.confirm('Store as a secret instead?', true);

			if (storeAsSecret) {
				isSecret = true;
			}
		}

		// Set in cloud
		const updatePayload = isSecret
			? { id: project.projectId, secrets: { [args.key]: args.value } }
			: { id: project.projectId, env: { [args.key]: args.value } };

		const label = isSecret ? 'secret' : 'environment variable';
		await tui.spinner(`Setting ${label} in cloud`, () => {
			return projectEnvUpdate(apiClient, updatePayload);
		});

		// Update local .env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const currentEnv = await readEnvFile(envFilePath);
		currentEnv[args.key] = args.value;

		// Filter out AGENTUITY_ keys before writing
		const filteredEnv = filterAgentuitySdkKeys(currentEnv);
		await writeEnvFile(envFilePath, filteredEnv);

		tui.success(
			`${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' set successfully (cloud + ${envFilePath})`
		);

		return {
			success: true,
			key: args.key,
			path: envFilePath,
			secret: isSecret,
		};
	},
});
