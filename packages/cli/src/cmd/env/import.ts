import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectEnvUpdate } from '@agentuity/server';
import { getAPIBaseURL, APIClient } from '../../api';
import { loadProjectConfig } from '../../config';
import {
	findEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	mergeEnvVars,
	splitEnvAndSecrets,
	looksLikeSecret,
} from '../../env-util';
import { getCommand } from '../../command-prefix';

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import environment variables from a file to cloud and local .env.production',
	requiresAuth: true,
	schema: {
		args: z.object({
			file: z.string().describe('path to the .env file to import'),
		}),
		options: z.object({
			dir: z.string().optional().describe('project directory (default: current directory)'),
		}),
	},

	async handler(ctx) {
		const { args, opts, config } = ctx;
		const dir = opts?.dir ?? process.cwd();

		// Load project config to get project ID
		const projectConfig = await loadProjectConfig(dir);
		if (!projectConfig) {
			tui.fatal(`No Agentuity project found in ${dir}. Missing agentuity.json`);
		}

		// Read the import file
		const importedEnv = await readEnvFile(args.file);

		if (Object.keys(importedEnv).length === 0) {
			tui.warning(`No environment variables found in ${args.file}`);
			return;
		}

		// Filter out AGENTUITY_ prefixed keys
		const filteredEnv = filterAgentuitySdkKeys(importedEnv);

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No valid environment variables to import (all were AGENTUITY_ prefixed)');
			return;
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
				return;
			}
		}

		const apiUrl = getAPIBaseURL(config);
		const client = new APIClient(apiUrl, config);

		// Split into env and secrets based on key naming conventions
		const { env: normalEnv, secrets } = splitEnvAndSecrets(filteredEnv);

		// Push to cloud
		await tui.spinner('Importing environment variables to cloud', () => {
			return projectEnvUpdate(client, {
				id: projectConfig.projectId,
				env: normalEnv,
				secrets: secrets,
			});
		});

		// Merge with local .env.production file
		const localEnvPath = await findEnvFile(dir);
		const localEnv = await readEnvFile(localEnvPath);
		const mergedEnv = mergeEnvVars(localEnv, filteredEnv);

		await writeEnvFile(localEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter((k) => k.startsWith('AGENTUITY_')),
		});

		const count = Object.keys(filteredEnv).length;
		tui.success(
			`Imported ${count} environment variable${count !== 1 ? 's' : ''} from ${args.file} to cloud and ${localEnvPath}`
		);
	},
});
