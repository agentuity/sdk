import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvDelete, projectGet, orgEnvDelete, orgEnvGet } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	isReservedAgentuityKey,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvDeleteResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Variable key that was deleted'),
	path: z
		.string()
		.optional()
		.describe('Local file path where variable was removed (project scope only)'),
	secret: z.boolean().describe('Whether a secret was deleted'),
	scope: z.enum(['project', 'org']).describe('The scope from which the variable was deleted'),
});

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	aliases: ['del', 'remove', 'rm'],
	description: 'Delete an environment variable or secret',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	idempotent: true,
	examples: [
		{ command: getCommand('env delete OLD_FEATURE_FLAG'), description: 'Delete variable' },
		{ command: getCommand('env rm API_KEY'), description: 'Delete a secret' },
		{
			command: getCommand('env rm OPENAI_API_KEY --org'),
			description: 'Delete org-level secret',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			key: z.string().describe('the variable or secret key to delete'),
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

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		// Validate key doesn't start with reserved AGENTUITY_ prefix (except AGENTUITY_PUBLIC_)
		if (isReservedAgentuityKey(args.key)) {
			tui.fatal(
				'Cannot delete AGENTUITY_ prefixed variables. These are reserved for system use.'
			);
		}

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			// First, determine if this key exists in env or secrets
			const orgData = await tui.spinner('Checking organization variable', () => {
				return orgEnvGet(apiClient, { id: orgId, mask: true });
			});

			const isSecret = orgData.secrets?.[args.key] !== undefined;
			const isEnv = orgData.env?.[args.key] !== undefined;

			if (!isSecret && !isEnv) {
				tui.fatal(
					`Variable '${args.key}' not found in organization`,
					ErrorCode.RESOURCE_NOT_FOUND
				);
			}

			// Delete from cloud
			const label = isSecret ? 'secret' : 'environment variable';
			await tui.spinner(`Deleting organization ${label} from cloud`, () => {
				return orgEnvDelete(apiClient, {
					id: orgId,
					...(isSecret ? { secrets: [args.key] } : { env: [args.key] }),
				});
			});

			tui.success(
				`Organization ${isSecret ? 'secret' : 'environment variable'} '${args.key}' deleted successfully`
			);

			return {
				success: true,
				key: args.key,
				secret: isSecret,
				scope: 'org' as const,
			};
		} else {
			// Project scope (existing behavior)
			const projectData = await tui.spinner('Checking variable', () => {
				return projectGet(apiClient, { id: project!.projectId, mask: true });
			});

			const isSecret = projectData.secrets?.[args.key] !== undefined;
			const isEnv = projectData.env?.[args.key] !== undefined;

			if (!isSecret && !isEnv) {
				tui.fatal(`Variable '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
			}

			// Delete from cloud using the correct field
			const label = isSecret ? 'secret' : 'environment variable';
			await tui.spinner(`Deleting ${label} from cloud`, () => {
				return projectEnvDelete(apiClient, {
					id: project!.projectId,
					...(isSecret ? { secrets: [args.key] } : { env: [args.key] }),
				});
			});

			// Update local .env file only if we have a project directory
			// (not when using --project-id without being in a project folder)
			let envFilePath: string | undefined;
			if (projectDir) {
				envFilePath = await findExistingEnvFile(projectDir);
				const currentEnv = await readEnvFile(envFilePath);
				delete currentEnv[args.key];

				// Filter out AGENTUITY_ keys before writing
				const filteredEnv = filterAgentuitySdkKeys(currentEnv);
				await writeEnvFile(envFilePath, filteredEnv);
			}

			const successMsg = envFilePath
				? `${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' deleted successfully (cloud + ${envFilePath})`
				: `${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' deleted successfully (cloud only)`;
			tui.success(successMsg);

			return {
				success: true,
				key: args.key,
				path: envFilePath,
				secret: isSecret,
				scope: 'project' as const,
			};
		}
	},
});
