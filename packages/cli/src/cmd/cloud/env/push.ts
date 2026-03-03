import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectEnvUpdate, orgEnvUpdate, projectGet, orgEnvGet } from '@agentuity/server/index.ts';
import {
	findExistingEnvFile,
	readEnvFile,
	filterAgentuitySdkKeys,
	splitEnvAndSecrets,
	validateNoPublicSecrets,
} from '../../../env-util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { resolveOrgId, isOrgScope } from './org-util.ts';
import { computeEnvDiff, displayEnvDiff } from './env-diff.ts';

const EnvPushResponseSchema = z.object({
	success: z.boolean().describe('Whether push succeeded'),
	pushed: z.number().describe('Number of items pushed'),
	envCount: z.number().describe('Number of env vars pushed'),
	secretCount: z.number().describe('Number of secrets pushed'),
	newCount: z.number().describe('Number of new variables added'),
	changedCount: z.number().describe('Number of existing variables overwritten'),
	unchangedCount: z.number().describe('Number of unchanged variables'),
	source: z.string().describe('Source file path'),
	scope: z.enum(['project', 'org']).describe('The scope where variables were pushed'),
	force: z.boolean().describe('Whether force mode was used'),
});

export const pushSubcommand = createSubcommand({
	name: 'push',
	description: 'Push environment variables and secrets from local .env file to cloud',
	tags: ['mutating', 'updates-resource', 'slow', 'api-intensive', 'requires-auth'],
	idempotent: true,
	examples: [
		{ command: getCommand('env push'), description: 'Push all variables to cloud (project)' },
		{ command: getCommand('env push --org'), description: 'Push all variables to organization' },
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	prerequisites: ['env set'],
	schema: {
		options: z.object({
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe('push to organization level (use --org for default org)'),
			force: z.boolean().default(false).describe('overwrite remote values without confirmation'),
		}),
		response: EnvPushResponseSchema,
	},

	async handler(ctx) {
		const { apiClient, project, projectDir, config, opts } = ctx;
		const useOrgScope = isOrgScope(opts?.org);

		// Always require projectDir since push reads from local .env file
		if (!projectDir) {
			tui.fatal('Project directory required. Run from a project directory.');
		}

		// Read local env file
		const envFilePath = await findExistingEnvFile(projectDir);
		const localEnv = await readEnvFile(envFilePath);

		// Filter out reserved AGENTUITY_ prefixed keys
		const filteredEnv = filterAgentuitySdkKeys(localEnv);

		const forceMode = opts?.force ?? false;

		if (Object.keys(filteredEnv).length === 0) {
			tui.warning('No variables to push');
			return {
				success: false,
				pushed: 0,
				envCount: 0,
				secretCount: 0,
				newCount: 0,
				changedCount: 0,
				unchangedCount: 0,
				source: envFilePath,
				scope: useOrgScope ? ('org' as const) : ('project' as const),
				force: forceMode,
			};
		}

		// Split into env and secrets based on key naming conventions
		const { env, secrets } = splitEnvAndSecrets(filteredEnv);

		// Check for any public vars that would have been treated as secrets
		const publicSecretKeys = validateNoPublicSecrets(secrets);
		if (publicSecretKeys.length > 0) {
			tui.warning(
				`Moving public variables to env: ${publicSecretKeys.join(', ')} (these are exposed to the frontend)`
			);
			for (const key of publicSecretKeys) {
				delete secrets[key];
				const value = filteredEnv[key];
				if (value !== undefined) {
					env[key] = value;
				}
			}
		}

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			// Fetch remote state to compute diff
			const orgData = await tui.spinner('Fetching remote variables', () => {
				return orgEnvGet(apiClient, { id: orgId, mask: false });
			});

			const diff = computeEnvDiff(env, secrets, orgData.env || {}, orgData.secrets || {});

			displayEnvDiff(diff, { direction: 'push' });

			// Prompt for confirmation if there are changes to existing variables
			if (diff.changedEntries.length > 0 && !forceMode) {
				const confirmed = await tui.confirm(
					`${diff.changedEntries.length} existing variable${diff.changedEntries.length !== 1 ? 's' : ''} will be overwritten. Continue?`,
					true
				);
				if (!confirmed) {
					tui.info('Push cancelled');
					return {
						success: false,
						pushed: 0,
						envCount: 0,
						secretCount: 0,
						newCount: 0,
						changedCount: 0,
						unchangedCount: 0,
						source: envFilePath,
						scope: 'org' as const,
						force: forceMode,
					};
				}
			}

			await tui.spinner('Pushing variables to organization', () => {
				return orgEnvUpdate(apiClient, {
					id: orgId,
					env,
					secrets,
				});
			});

			const envCount = Object.keys(env).length;
			const secretCount = Object.keys(secrets).length;
			const totalCount = envCount + secretCount;

			tui.success(
				`Pushed ${totalCount} variable${totalCount !== 1 ? 's' : ''} to organization (${diff.newEntries.length} new, ${diff.changedEntries.length} updated, ${diff.unchangedEntries.length} unchanged)`
			);

			return {
				success: true,
				pushed: totalCount,
				envCount,
				secretCount,
				newCount: diff.newEntries.length,
				changedCount: diff.changedEntries.length,
				unchangedCount: diff.unchangedEntries.length,
				source: envFilePath,
				scope: 'org' as const,
				force: forceMode,
			};
		} else {
			// Project scope
			if (!project) {
				tui.fatal(
					'Project context required. Run from a project directory or use --org for organization scope.'
				);
			}

			// Fetch remote state to compute diff
			const projectData = await tui.spinner('Fetching remote variables', () => {
				return projectGet(apiClient, { id: project.projectId, mask: false });
			});

			const diff = computeEnvDiff(
				env,
				secrets,
				projectData.env || {},
				projectData.secrets || {}
			);

			displayEnvDiff(diff, { direction: 'push' });

			// Prompt for confirmation if there are changes to existing variables
			if (diff.changedEntries.length > 0 && !forceMode) {
				const confirmed = await tui.confirm(
					`${diff.changedEntries.length} existing variable${diff.changedEntries.length !== 1 ? 's' : ''} will be overwritten. Continue?`,
					true
				);
				if (!confirmed) {
					tui.info('Push cancelled');
					return {
						success: false,
						pushed: 0,
						envCount: 0,
						secretCount: 0,
						newCount: 0,
						changedCount: 0,
						unchangedCount: 0,
						source: envFilePath,
						scope: 'project' as const,
						force: forceMode,
					};
				}
			}

			await tui.spinner('Pushing variables to cloud', () => {
				return projectEnvUpdate(apiClient, {
					id: project.projectId,
					env,
					secrets,
				});
			});

			const envCount = Object.keys(env).length;
			const secretCount = Object.keys(secrets).length;
			const totalCount = envCount + secretCount;

			tui.success(
				`Pushed ${totalCount} variable${totalCount !== 1 ? 's' : ''} to cloud (${diff.newEntries.length} new, ${diff.changedEntries.length} updated, ${diff.unchangedEntries.length} unchanged)`
			);

			return {
				success: true,
				pushed: totalCount,
				envCount,
				secretCount,
				newCount: diff.newEntries.length,
				changedCount: diff.changedEntries.length,
				unchangedCount: diff.unchangedEntries.length,
				source: envFilePath,
				scope: 'project' as const,
				force: forceMode,
			};
		}
	},
});
