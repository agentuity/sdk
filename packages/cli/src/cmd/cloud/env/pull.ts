import { z } from 'zod';
import { join } from 'node:path';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet, orgEnvGet } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	mergeEnvVars,
	isReservedAgentuityKey,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvPullResponseSchema = z.object({
	success: z.boolean().describe('Whether pull succeeded'),
	pulled: z.number().describe('Number of items pulled'),
	path: z.string().describe('Local file path where variables were saved'),
	force: z.boolean().describe('Whether force mode was used'),
	scope: z.enum(['project', 'org']).describe('The scope from which variables were pulled'),
});

export const pullSubcommand = createSubcommand({
	name: 'pull',
	description: 'Pull environment variables from cloud to local .env file',
	tags: ['slow', 'requires-auth'],
	idempotent: true,
	examples: [
		{ command: getCommand('env pull'), description: 'Pull from project' },
		{ command: getCommand('env pull --force'), description: 'Overwrite local with cloud values' },
		{ command: getCommand('env pull --org'), description: 'Pull from organization' },
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['cloud deploy'],
	schema: {
		options: z.object({
			force: z.boolean().default(false).describe('overwrite local values with cloud values'),
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe('pull from organization level (use --org for default org)'),
		}),
		response: EnvPullResponseSchema,
	},

	async handler(ctx) {
		const { opts, apiClient, project, projectDir, config } = ctx;
		const useOrgScope = isOrgScope(opts?.org);

		// Require project context for local file operations
		if (!projectDir) {
			tui.fatal('Project context required. Run from a project directory.');
		}

		let cloudEnv: Record<string, string>;
		let scope: 'project' | 'org';
		let cloudApiKey: string | undefined;

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			const orgData = await tui.spinner(
				'Pulling environment variables from organization',
				() => {
					return orgEnvGet(apiClient, { id: orgId, mask: false });
				}
			);

			cloudEnv = { ...orgData.env, ...orgData.secrets };
			scope = 'org';
			cloudApiKey = undefined; // Orgs don't have api_key
		} else {
			// Project scope
			if (!project) {
				tui.fatal(
					'Project context required. Run from a project directory or use --org for organization scope.'
				);
			}

			const projectData = await tui.spinner('Pulling environment variables from cloud', () => {
				return projectGet(apiClient, { id: project.projectId, mask: false });
			});

			cloudEnv = { ...projectData.env, ...projectData.secrets };
			scope = 'project';
			cloudApiKey = projectData.api_key;
		}

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

		// Restore AGENTUITY_SDK_KEY to .env (cloud is source of truth, fallback to local)
		// The key was removed by the write above since it's in skipKeys, so we need to restore it
		const dotEnvPath = join(projectDir, '.env');
		const dotEnv = await readEnvFile(dotEnvPath);

		// Cloud is source of truth: use cloud api_key if available, otherwise fallback to local
		// For org scope, only restore if local key exists (orgs don't have api_key)
		const sdkKeyToWrite = cloudApiKey || localSdkKey;
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
			if (cloudApiKey && cloudApiKey !== localSdkKey) {
				tui.info(`Wrote AGENTUITY_SDK_KEY to ${dotEnvPath}`);
			}
		}

		const count = Object.keys(cloudEnv).length;
		const scopeLabel = useOrgScope ? 'organization' : 'project';
		tui.success(
			`Pulled ${count} environment variable${count !== 1 ? 's' : ''} from ${scopeLabel} to ${targetEnvPath}`
		);

		return {
			success: true,
			pulled: count,
			path: targetEnvPath,
			force: opts?.force ?? false,
			scope,
		};
	},
});
