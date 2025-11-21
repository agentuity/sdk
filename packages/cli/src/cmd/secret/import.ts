import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import {
	findEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	mergeEnvVars,
} from '../../env-util';
import { getCommand } from '../../command-prefix';

const SecretImportResponseSchema = z.object({
	success: z.boolean().describe('Whether import succeeded'),
	imported: z.number().describe('Number of items imported'),
	skipped: z.number().describe('Number of items skipped'),
	path: z.string().describe('Local file path where secrets were saved'),
	file: z.string().describe('Source file path'),
});

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import secrets from a file to cloud and local .env.production',
	tags: [
		'mutating',
		'creates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
		'requires-project',
	],
	examples: [
		getCommand('secret import .env.local'),
		getCommand('secret import .env.production.backup'),
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

		// Filter out AGENTUITY_ prefixed keys
		const filteredSecrets = filterAgentuitySdkKeys(importedSecrets);

		if (Object.keys(filteredSecrets).length === 0) {
			tui.warning('No valid secrets to import (all were AGENTUITY_ prefixed)');
			return {
				success: false,
				imported: 0,
				skipped: Object.keys(importedSecrets).length,
				path: '',
				file: args.file,
			};
		}

		// Push to cloud (using secrets field)
		await tui.spinner('Importing secrets to cloud', () => {
			return projectEnvUpdate(apiClient, {
				id: project.projectId,
				secrets: filteredSecrets,
			});
		});

		// Merge with local .env.production file
		const localEnvPath = await findEnvFile(projectDir);
		const localEnv = await readEnvFile(localEnvPath);
		const mergedEnv = mergeEnvVars(localEnv, filteredSecrets);

		await writeEnvFile(localEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter((k) => k.startsWith('AGENTUITY_')),
		});

		const count = Object.keys(filteredSecrets).length;
		tui.success(
			`Imported ${count} secret${count !== 1 ? 's' : ''} from ${args.file} to cloud and ${localEnvPath}`
		);

		return {
			success: true,
			imported: count,
			skipped: Object.keys(importedSecrets).length - count,
			path: localEnvPath,
			file: args.file,
		};
	},
});
