import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectGet, orgEnvGet } from '@agentuity/server/index.ts';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	mergeEnvVars,
	splitEnvAndSecrets,
	filterAgentuitySdkKeys,
} from '../../../env-util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { resolveOrgId, isOrgScope } from './org-util.ts';
import { computeEnvDiff, displayEnvDiff } from './env-diff.ts';

const EnvPullResponseSchema = z.object({
	success: z.boolean().describe('Whether pull succeeded'),
	pulled: z.number().describe('Number of items pulled'),
	newCount: z.number().describe('Number of new variables added locally'),
	changedCount: z.number().describe('Number of local variables overwritten'),
	unchangedCount: z.number().describe('Number of unchanged variables'),
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
		const forceMode = opts?.force ?? false;

		// Require project context for local file operations
		if (!projectDir) {
			tui.fatal('Project context required. Run from a project directory.');
		}

		let cloudEnvVars: Record<string, string> = {};
		let cloudSecretVars: Record<string, string> = {};
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

			cloudEnvVars = orgData.env || {};
			cloudSecretVars = orgData.secrets || {};
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

			cloudEnvVars = projectData.env || {};
			cloudSecretVars = projectData.secrets || {};
			scope = 'project';
			cloudApiKey = projectData.api_key;
		}

		// Target file is always .env
		const targetEnvPath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(targetEnvPath);

		// Preserve local AGENTUITY_SDK_KEY
		const localSdkKey = localEnv.AGENTUITY_SDK_KEY;

		// Split local env for diff comparison (excluding AGENTUITY_ reserved keys)
		const localForDiff = { ...localEnv };
		delete localForDiff.AGENTUITY_SDK_KEY;
		const filteredLocal = filterAgentuitySdkKeys(localForDiff);
		const { env: localEnvVars, secrets: localSecretVars } = splitEnvAndSecrets(filteredLocal);

		// Compute diff: cloud (source) → local (target)
		const diff = computeEnvDiff(cloudEnvVars, cloudSecretVars, localEnvVars, localSecretVars);

		// Display diff
		displayEnvDiff(diff, { direction: 'pull' });

		// If force mode and there are changes, prompt for confirmation
		if (forceMode && diff.changedEntries.length > 0) {
			const confirmed = await tui.confirm(
				`${diff.changedEntries.length} local variable${diff.changedEntries.length !== 1 ? 's' : ''} will be overwritten. Continue?`,
				true
			);
			if (!confirmed) {
				tui.info('Pull cancelled');
				return {
					success: false,
					pulled: 0,
					newCount: 0,
					changedCount: 0,
					unchangedCount: 0,
					path: targetEnvPath,
					force: forceMode,
					scope,
				};
			}
		}

		// Merge: cloud values override local if force=true, otherwise keep local
		const cloudEnv = { ...cloudEnvVars, ...cloudSecretVars };
		let mergedEnv: Record<string, string>;
		if (forceMode) {
			// Cloud values take priority
			mergedEnv = mergeEnvVars(localEnv, cloudEnv);
		} else {
			// Local values take priority (only add new keys from cloud)
			mergedEnv = mergeEnvVars(cloudEnv, localEnv);
		}

		// Determine the SDK key to use: cloud api_key is source of truth, fallback to local
		const sdkKeyToWrite = cloudApiKey || localSdkKey;
		if (sdkKeyToWrite) {
			mergedEnv.AGENTUITY_SDK_KEY = sdkKeyToWrite;
		}

		// Write to .env in a single operation, preserveExisting: false since we have the full merged state
		await writeEnvFile(targetEnvPath, mergedEnv, {
			preserveExisting: false,
			addComment: (key) => {
				if (key === 'AGENTUITY_SDK_KEY') {
					return 'AGENTUITY_SDK_KEY is a sensitive value and should not be committed to version control.';
				}
				return null;
			},
		});

		if (cloudApiKey && cloudApiKey !== localSdkKey) {
			tui.info(`Wrote AGENTUITY_SDK_KEY to ${targetEnvPath}`);
		}

		const count = Object.keys(cloudEnv).length;
		const scopeLabel = useOrgScope ? 'organization' : 'project';

		// Update success message with diff counts
		if (forceMode) {
			tui.success(
				`Pulled ${count} variable${count !== 1 ? 's' : ''} from ${scopeLabel} (${diff.newEntries.length} new, ${diff.changedEntries.length} updated, ${diff.unchangedEntries.length} unchanged)`
			);
		} else {
			tui.success(
				`Pulled ${count} variable${count !== 1 ? 's' : ''} from ${scopeLabel} (${diff.newEntries.length} new, ${diff.changedEntries.length} skipped, ${diff.unchangedEntries.length} unchanged)`
			);
		}

		return {
			success: true,
			pulled: count,
			newCount: diff.newEntries.length,
			changedCount: forceMode ? diff.changedEntries.length : 0,
			unchangedCount: diff.unchangedEntries.length,
			path: targetEnvPath,
			force: forceMode,
			scope,
		};
	},
});
