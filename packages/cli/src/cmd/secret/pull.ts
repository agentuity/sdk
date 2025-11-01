import { z } from 'zod';
import { join } from 'node:path';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectGet } from '@agentuity/server';
import {
	findEnvFile,
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	mergeEnvVars,
} from '../../env-util';

export const pullSubcommand = createSubcommand({
	name: 'pull',
	description: 'Pull secrets from cloud to local .env.production file',
	requiresAuth: true,
	requiresProject: true,
	requiresAPIClient: true,
	schema: {
		options: z.object({
			force: z.boolean().default(false).describe('overwrite local values with cloud values'),
		}),
	},

	async handler(ctx) {
		const { opts, apiClient, project, projectDir } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Pulling secrets from cloud', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		const cloudSecrets = projectData.secrets || {};

		// Read current local env from existing file (.env.production or .env)
		const existingEnvPath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(existingEnvPath);

		// Target file is always .env.production
		const targetEnvPath = await findEnvFile(projectDir);

		// Merge: cloud values override local if force=true, otherwise keep local
		let mergedEnv: Record<string, string>;
		if (opts?.force) {
			// Cloud values take priority
			mergedEnv = mergeEnvVars(localEnv, cloudSecrets);
		} else {
			// Local values take priority (only add new keys from cloud)
			mergedEnv = mergeEnvVars(cloudSecrets, localEnv);
		}

		// Write to .env.production (skip AGENTUITY_ keys)
		await writeEnvFile(targetEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter((k) => k.startsWith('AGENTUITY_')),
		});

		// Write AGENTUITY_SDK_KEY to .env if present and missing locally
		if (projectData.api_key) {
			const dotEnvPath = join(projectDir, '.env');
			const dotEnv = await readEnvFile(dotEnvPath);

			if (!dotEnv.AGENTUITY_SDK_KEY) {
				dotEnv.AGENTUITY_SDK_KEY = projectData.api_key;
				await writeEnvFile(dotEnvPath, dotEnv, {
					addComment: (key) => {
						if (key === 'AGENTUITY_SDK_KEY') {
							return 'AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
						}
						return null;
					},
				});
				tui.info(`Wrote AGENTUITY_SDK_KEY to ${dotEnvPath}`);
			}
		}

		const count = Object.keys(cloudSecrets).length;
		tui.success(`Pulled ${count} secret${count !== 1 ? 's' : ''} to ${targetEnvPath}`);
	},
});
