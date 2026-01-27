import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvDelete, projectGet, orgEnvDelete, orgEnvGet } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	isReservedAgentuityKey,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	keys: z.array(z.string()).describe('Variable keys that were deleted'),
	path: z
		.string()
		.optional()
		.describe('Local file path where variables were removed (project scope only)'),
	secrets: z.array(z.string()).describe('Keys that were secrets'),
	env: z.array(z.string()).describe('Keys that were environment variables'),
	scope: z.enum(['project', 'org']).describe('The scope from which the variables were deleted'),
	notFound: z.array(z.string()).optional().describe('Keys that were not found'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete one or more environment variables or secrets',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	examples: [
		{ command: getCommand('env delete OLD_FEATURE_FLAG'), description: 'Delete a variable' },
		{ command: getCommand('env rm API_KEY'), description: 'Delete a secret' },
		{
			command: getCommand('env rm KEY1 KEY2 KEY3'),
			description: 'Delete multiple variables at once',
		},
		{
			command: getCommand('env rm OPENAI_API_KEY --org'),
			description: 'Delete org-level secret',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			key: z.array(z.string()).describe('the variable or secret key(s) to delete'),
		}),
		options: z.object({
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe(
					'delete from organization level (use --org for default org, or --org <orgId> for specific org)'
				),
		}),
		response: EnvDeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, project, projectDir, apiClient, config, opts } = ctx;
		const useOrgScope = isOrgScope(opts?.org);
		const keys = args.key;

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		// Validate no keys start with reserved AGENTUITY_ prefix (except AGENTUITY_PUBLIC_)
		const reservedKeys = keys.filter(isReservedAgentuityKey);
		if (reservedKeys.length > 0) {
			tui.fatal(
				`Cannot delete AGENTUITY_ prefixed variables: ${reservedKeys.join(', ')}. These are reserved for system use.`
			);
		}

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			// First, determine which keys exist in env or secrets
			const orgData = await tui.spinner('Checking organization variables', () => {
				return orgEnvGet(apiClient, { id: orgId, mask: true });
			});

			const secretKeys: string[] = [];
			const envKeys: string[] = [];
			const notFoundKeys: string[] = [];

			for (const key of keys) {
				if (orgData.secrets?.[key] !== undefined) {
					secretKeys.push(key);
				} else if (orgData.env?.[key] !== undefined) {
					envKeys.push(key);
				} else {
					notFoundKeys.push(key);
				}
			}

			// If all keys are not found, fail
			if (secretKeys.length === 0 && envKeys.length === 0) {
				tui.fatal(
					`No variables found in organization: ${keys.join(', ')}`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}

			// Delete from cloud (batch operation)
			const totalToDelete = secretKeys.length + envKeys.length;
			const label = totalToDelete === 1 ? 'variable' : 'variables';
			await tui.spinner(`Deleting ${totalToDelete} organization ${label} from cloud`, () => {
				return orgEnvDelete(apiClient, {
					id: orgId,
					...(secretKeys.length > 0 ? { secrets: secretKeys } : {}),
					...(envKeys.length > 0 ? { env: envKeys } : {}),
				});
			});

			const deletedKeys = [...secretKeys, ...envKeys];
			if (notFoundKeys.length > 0) {
				tui.warn(`Variables not found (skipped): ${notFoundKeys.join(', ')}`);
			}
			tui.success(
				`Deleted ${deletedKeys.length} organization variable(s): ${deletedKeys.join(', ')}`
			);

			return {
				success: true,
				keys: deletedKeys,
				secrets: secretKeys,
				env: envKeys,
				scope: 'org' as const,
				...(notFoundKeys.length > 0 ? { notFound: notFoundKeys } : {}),
			};
		} else {
			// Project scope
			const projectData = await tui.spinner('Checking variables', () => {
				return projectGet(apiClient, { id: project!.projectId, mask: true });
			});

			const secretKeys: string[] = [];
			const envKeys: string[] = [];
			const notFoundKeys: string[] = [];

			for (const key of keys) {
				if (projectData.secrets?.[key] !== undefined) {
					secretKeys.push(key);
				} else if (projectData.env?.[key] !== undefined) {
					envKeys.push(key);
				} else {
					notFoundKeys.push(key);
				}
			}

			// If all keys are not found, fail
			if (secretKeys.length === 0 && envKeys.length === 0) {
				tui.fatal(`No variables found: ${keys.join(', ')}`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			// Delete from cloud (batch operation)
			const totalToDelete = secretKeys.length + envKeys.length;
			const label = totalToDelete === 1 ? 'variable' : 'variables';
			await tui.spinner(`Deleting ${totalToDelete} ${label} from cloud`, () => {
				return projectEnvDelete(apiClient, {
					id: project!.projectId,
					...(secretKeys.length > 0 ? { secrets: secretKeys } : {}),
					...(envKeys.length > 0 ? { env: envKeys } : {}),
				});
			});

			// Update local .env file only if we have a project directory
			let envFilePath: string | undefined;
			if (projectDir) {
				envFilePath = await findExistingEnvFile(projectDir);
				const currentEnv = await readEnvFile(envFilePath);
				for (const key of [...secretKeys, ...envKeys]) {
					delete currentEnv[key];
				}
				await writeEnvFile(envFilePath, currentEnv, { preserveExisting: false });
			}

			const deletedKeys = [...secretKeys, ...envKeys];
			if (notFoundKeys.length > 0) {
				tui.warn(`Variables not found (skipped): ${notFoundKeys.join(', ')}`);
			}

			const locationMsg = envFilePath ? ` (cloud + ${envFilePath})` : ' (cloud only)';
			tui.success(`Deleted ${deletedKeys.length} variable(s): ${deletedKeys.join(', ')}${locationMsg}`);

			return {
				success: true,
				keys: deletedKeys,
				path: envFilePath,
				secrets: secretKeys,
				env: envKeys,
				scope: 'project' as const,
				...(notFoundKeys.length > 0 ? { notFound: notFoundKeys } : {}),
			};
		}
	},
});
