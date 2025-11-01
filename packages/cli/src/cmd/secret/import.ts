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

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import secrets from a file to cloud and local .env.production',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,
	schema: {
		args: z.object({
			file: z.string().describe('path to the .env file to import'),
		}),
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir } = ctx;

		// Read the import file
		const importedSecrets = await readEnvFile(args.file);

		if (Object.keys(importedSecrets).length === 0) {
			tui.warning(`No secrets found in ${args.file}`);
			return;
		}

		// Filter out AGENTUITY_ prefixed keys
		const filteredSecrets = filterAgentuitySdkKeys(importedSecrets);

		if (Object.keys(filteredSecrets).length === 0) {
			tui.warning('No valid secrets to import (all were AGENTUITY_ prefixed)');
			return;
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
	},
});
