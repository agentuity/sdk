import { z } from 'zod';
import { join } from 'node:path';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	mergeEnvVars,
	isReservedAgentuityKey,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';

const EnvPullResponseSchema = z.object({
	success: z.boolean().describe('Whether pull succeeded'),
	pulled: z.number().describe('Number of items pulled'),
	path: z.string().describe('Local file path where variables were saved'),
	force: z.boolean().describe('Whether force mode was used'),
});

export const pullSubcommand = createSubcommand({
	name: 'pull',
	description: 'Pull environment variables from cloud to local .env file',
	tags: ['slow', 'requires-auth', 'requires-project'],
	idempotent: true,
	examples: [
		{ command: getCommand('env pull'), description: 'Run pull command' },
		{ command: getCommand('env pull --force'), description: 'Use force option' },
	],
	requires: { auth: true, project: true, apiClient: true },
	prerequisites: ['cloud deploy'],
	schema: {
		options: z.object({
			force: z.boolean().default(false).describe('overwrite local values with cloud values'),
		}),
		response: EnvPullResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, projectDir } = ctx;

		// Fetch project with unmasked secrets
		const projectData = await tui.spinner('Pulling environment variables from cloud', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		const cloudEnv = { ...projectData.env, ...projectData.secrets }; // env pull with actually do both secrets and env since thats likely what the user would want

		// Target file is always .env
		const targetEnvPath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(targetEnvPath);

		// Preserve local AGENTUITY_SDK_KEY before writing (since it will be skipped in the first write)
		const localSdkKey = localEnv.AGENTUITY_SDK_KEY;

		// Merge: cloud values override local if force=true, otherwise keep local
		let mergedEnv: Record<string, string>;
		if (opts?.force) {
			// Cloud values take priority
			mergedEnv = mergeEnvVars(localEnv, cloudEnv);
		} else {
			// Local values take priority (only add new keys from cloud)
			mergedEnv = mergeEnvVars(cloudEnv, localEnv);
		}

		// Write to .env (skip reserved AGENTUITY_ keys, except AGENTUITY_PUBLIC_)
		await writeEnvFile(targetEnvPath, mergedEnv, {
			skipKeys: Object.keys(mergedEnv).filter(isReservedAgentuityKey),
		});

		// Restore AGENTUITY_SDK_KEY to .env (preserve local if exists, otherwise use cloud)
		// The key was removed by the write above since it's in skipKeys, so we need to restore it
		const dotEnvPath = join(projectDir, '.env');
		const dotEnv = await readEnvFile(dotEnvPath);

		// Use local SDK key if it exists, otherwise use cloud value
		const sdkKeyToWrite = localSdkKey || projectData.api_key;
		if (sdkKeyToWrite) {
			dotEnv.AGENTUITY_SDK_KEY = sdkKeyToWrite;
			await writeEnvFile(dotEnvPath, dotEnv, {
				addComment: (key) => {
					if (key === 'AGENTUITY_SDK_KEY') {
						return 'AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
					}
					return null;
				},
			});
			if (!localSdkKey && projectData.api_key) {
				tui.info(`Wrote AGENTUITY_SDK_KEY to ${dotEnvPath}`);
			}
		}

		const count = Object.keys(cloudEnv).length;
		tui.success(
			`Pulled ${count} environment variable${count !== 1 ? 's' : ''} to ${targetEnvPath}`
		);

		return {
			success: true,
			pulled: count,
			path: targetEnvPath,
			force: opts?.force ?? false,
		};
	},
});
