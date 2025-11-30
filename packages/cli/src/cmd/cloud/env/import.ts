import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	mergeEnvVars,
	splitEnvAndSecrets,
	looksLikeSecret,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvImportResponseSchema = z.object({
	success: z.boolean().describe('Whether import succeeded'),
	imported: z.number().describe('Number of items imported'),
	skipped: z.number().describe('Number of items skipped'),
	path: z.string().describe('Local file path where variables were saved'),
	file: z.string().describe('Source file path'),
});

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import environment variables from a file to cloud and local .env.production',
	tags: [
		'mutating',
		'creates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	examples: [
		{
			command: getCommand('cloud env import .env'),
			description: 'Import environment variables from .env file',
		},
		{
			command: getCommand('cloud env import .env.local'),
			description: 'Import from .env.local file',
		},
	],
	idempotent: false,
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			file: z.string().describe('path to the .env file to import'),
		}),
		response: EnvImportResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

		// Read the import file
		const importedEnv = await readEnvFile(args.file);

		if (Object.keys(importedEnv).length === 0) {
			tui.warning(`No environment variables found in ${args.file}`);
			return {
				success: false,
				imported: 0,
				skipped: 0,
				path: '',
				file: args.file,
			};
		}

		// Filter out AGENTUITY_ prefixed keys
		const filteredEnv = filterAgentuitySdkKeys(importedEnv);

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No valid environment variables to import (all were AGENTUITY_ prefixed)');
			return {
				success: false,
				imported: 0,
				skipped: Object.keys(importedEnv).length,
				path: '',
				file: args.file,
			};
		}

		// Check for potential secrets in the imported variables
		const potentialSecrets: string[] = [];
		for (const [key, value] of Object.entries(filteredEnv)) {
			if (looksLikeSecret(key, value)) {
				potentialSecrets.push(key);
			}
		}

		if (potentialSecrets.length > 0) {
			tui.warning(
				`Found ${potentialSecrets.length} variable(s) that look like they should be secrets:`
			);
			for (const key of potentialSecrets) {
				tui.info(`  • ${key}`);
			}
			tui.info(`\nSecrets should be stored using: ${getCommand('secret import <file>')}`);
			tui.info('This keeps them more secure and properly masked in the cloud.');

			const response = await tui.confirm(
				'Do you still want to import these as regular environment variables?',
				false
			);

			if (!response) {
				tui.info(
					`Cancelled. Use "${getCommand('secret import')}" to store these as secrets instead.`
				);
				return {
					success: false,
					imported: 0,
					skipped: Object.keys(filteredEnv).length,
					path: '',
					file: args.file,
				};
			}
		}

		// Split into env and secrets based on key naming conventions
		const { env: normalEnv, secrets } = splitEnvAndSecrets(filteredEnv);

		// Push to cloud
		await tui.spinner('Importing environment variables to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				env: normalEnv,
				secrets: secrets,
			});
		});

		// Merge with local .env.production file
		const localEnvPath = await findEnvFile(projectDir);
		const localEnv = await readEnvFile(localEnvPath);
		const mergedEnv = mergeEnvVars(localEnv, filteredEnv);

		await writeEnvFile(localEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter((k) => k.startsWith('AGENTUITY_')),
		});

		const count = Object.keys(filteredEnv).length;
		tui.success(
			`Imported ${count} environment variable${count !== 1 ? 's' : ''} from ${args.file} to cloud and ${localEnvPath}`
		);

		return {
			success: true,
			imported: count,
			skipped: Object.keys(importedEnv).length - count,
			path: localEnvPath,
			file: args.file,
		};
	},
});
