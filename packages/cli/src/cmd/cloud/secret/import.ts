import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	mergeEnvVars,
	validateNoPublicSecrets,
	splitEnvAndSecrets,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const SecretImportResponseSchema = z.object({
	success: z.boolean().describe('Whether import succeeded'),
	imported: z.number().describe('Number of items imported'),
	skipped: z.number().describe('Number of items skipped'),
	path: z.string().describe('Local file path where secrets were saved'),
	file: z.string().describe('Source file path'),
});

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import secrets from a file to cloud and local .env',
	tags: [
		'mutating',
		'creates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	examples: [
		{ command: getCommand('secret import .env.local'), description: 'Run .env.local command' },
		{
			command: getCommand('secret import .env.backup'),
			description: 'Run .env.backup command',
		},
	],
	idempotent: false,
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			file: z.string().describe('path to the .env file to import'),
		}),
		response: SecretImportResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

		// Read the import file
		const importedSecrets = await readEnvFile(args.file);

		if (Object.keys(importedSecrets).length === 0) {
			tui.warning(`No secrets found in ${args.file}`);
			return {
				success: false,
				imported: 0,
				skipped: 0,
				path: '',
				file: args.file,
			};
		}

		// Filter out reserved AGENTUITY_ prefixed keys
		const filteredVars = filterAgentuitySdkKeys(importedSecrets);

		if (Object.keys(filteredVars).length === 0) {
			tui.warning('No valid secrets to import (all were reserved AGENTUITY_ prefixed)');
			return {
				success: false,
				imported: 0,
				skipped: Object.keys(importedSecrets).length,
				path: '',
				file: args.file,
			};
		}

		// Split into env and secrets (public vars will be in env, not secrets)
		const { env, secrets } = splitEnvAndSecrets(filteredVars);

		// Check for any public vars that would have been treated as secrets
		const publicSecretKeys = validateNoPublicSecrets(secrets);
		if (publicSecretKeys.length > 0) {
			tui.warning(
				`Moving public variables to env: ${publicSecretKeys.join(', ')} (these are exposed to the frontend)`
			);
			for (const key of publicSecretKeys) {
				delete secrets[key];
				env[key] = filteredVars[key];
			}
		}

		// Push to cloud
		await tui.spinner('Importing secrets to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				env,
				secrets,
			});
		});

		// Merge with local .env file
		const localEnvPath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(localEnvPath);
		const mergedEnv = mergeEnvVars(localEnv, filteredVars);

		await writeEnvFile(localEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter((k) =>
				k.startsWith('AGENTUITY_') && !k.startsWith('AGENTUITY_PUBLIC_')
			),
		});

		const envCount = Object.keys(env).length;
		const secretCount = Object.keys(secrets).length;
		const totalCount = envCount + secretCount;
		tui.success(
			`Imported ${totalCount} variable${totalCount !== 1 ? 's' : ''} from ${args.file} (${envCount} env, ${secretCount} secret${secretCount !== 1 ? 's' : ''})`
		);

		return {
			success: true,
			imported: totalCount,
			skipped: Object.keys(importedSecrets).length - totalCount,
			path: localEnvPath,
			file: args.file,
		};
	},
});
