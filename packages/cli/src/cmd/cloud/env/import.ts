import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate, orgEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	mergeEnvVars,
	splitEnvAndSecrets,
	validateNoPublicSecrets,
	isReservedAgentuityKey,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvImportResponseSchema = z.object({
	success: z.boolean().describe('Whether import succeeded'),
	imported: z.number().describe('Number of items imported'),
	envCount: z.number().describe('Number of env vars imported'),
	secretCount: z.number().describe('Number of secrets imported'),
	skipped: z.number().describe('Number of items skipped'),
	path: z.string().optional().describe('Local file path where variables were saved (project scope only)'),
	file: z.string().describe('Source file path'),
	scope: z.enum(['project', 'org']).describe('The scope where variables were imported'),
});

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import environment variables and secrets from a file to cloud and local .env',
	tags: [
		'mutating',
		'creates-resource',
		'slow',
		'api-intensive',
		'requires-auth',
	],
	examples: [
		{
			command: getCommand('cloud env import .env.backup'),
			description: 'Import variables from backup file',
		},
		{
			command: getCommand('cloud env import .env.local'),
			description: 'Import from .env.local file',
		},
		{
			command: getCommand('cloud env import .env.shared --org'),
			description: 'Import to organization level',
		},
	],
	idempotent: false,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			file: z.string().describe('path to the .env file to import'),
		}),
		options: z.object({
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe('import to organization level (use --org for default org)'),
		}),
		response: EnvImportResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, projectDir, config, opts } = ctx;
		const useOrgScope = isOrgScope(opts?.org);

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal('Project context required. Run from a project directory or use --org for organization scope.');
		}

		// Read the import file
		const importedVars = await readEnvFile(args.file);

		if (Object.keys(importedVars).length === 0) {
			tui.warning(`No variables found in ${args.file}`);
			return {
				success: false,
				imported: 0,
				envCount: 0,
				secretCount: 0,
				skipped: 0,
				file: args.file,
				scope: useOrgScope ? 'org' as const : 'project' as const,
			};
		}

		// Filter out reserved AGENTUITY_ prefixed keys
		const filteredVars = filterAgentuitySdkKeys(importedVars);

		if (Object.keys(filteredVars).length === 0) {
			tui.warning('No valid variables to import (all were reserved AGENTUITY_ prefixed)');
			return {
				success: false,
				imported: 0,
				envCount: 0,
				secretCount: 0,
				skipped: Object.keys(importedVars).length,
				file: args.file,
				scope: useOrgScope ? 'org' as const : 'project' as const,
			};
		}

		// Split into env and secrets based on key naming conventions
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

		const envCount = Object.keys(env).length;
		const secretCount = Object.keys(secrets).length;
		const totalCount = envCount + secretCount;

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			await tui.spinner('Importing variables to organization', () => {
				return orgEnvUpdate(apiClient, {
					id: orgId,
					env,
					secrets,
				});
			});

			tui.success(
				`Imported ${totalCount} variable${totalCount !== 1 ? 's' : ''} to organization from ${args.file} (${envCount} env, ${secretCount} secret${secretCount !== 1 ? 's' : ''})`
			);

			return {
				success: true,
				imported: totalCount,
				envCount,
				secretCount,
				skipped: Object.keys(importedVars).length - totalCount,
				file: args.file,
				scope: 'org' as const,
			};
		} else {
			// Project scope (existing behavior)
			await tui.spinner('Importing variables to cloud', () => {
				return projectEnvUpdate(apiClient, {
					id: project!.projectId,
					env,
					secrets,
				});
			});

			// Merge with local .env file
			const localEnvPath = await findExistingEnvFile(projectDir!);
			const localEnv = await readEnvFile(localEnvPath);
			const mergedEnv = mergeEnvVars(localEnv, filteredVars);

			await writeEnvFile(localEnvPath, mergedEnv, {
				skipKeys: Object.keys(mergedEnv).filter(isReservedAgentuityKey),
			});

			tui.success(
				`Imported ${totalCount} variable${totalCount !== 1 ? 's' : ''} from ${args.file} (${envCount} env, ${secretCount} secret${secretCount !== 1 ? 's' : ''})`
			);

			return {
				success: true,
				imported: totalCount,
				envCount,
				secretCount,
				skipped: Object.keys(importedVars).length - totalCount,
				path: localEnvPath,
				file: args.file,
				scope: 'project' as const,
			};
		}
	},
});
