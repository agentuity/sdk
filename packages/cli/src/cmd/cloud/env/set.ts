import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectEnvUpdate, orgEnvUpdate } from '@agentuity/server';
import {
	findExistingEnvFile,
	readEnvFile,
	writeEnvFile,
	filterAgentuitySdkKeys,
	looksLikeSecret,
	isReservedAgentuityKey,
	isPublicVarKey,
	PUBLIC_VAR_PREFIXES,
} from '../../../env-util';
import { getCommand } from '../../../command-prefix';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	key: z.string().describe('Environment variable key'),
	path: z
		.string()
		.optional()
		.describe('Local file path where env var was saved (project scope only)'),
	secret: z.boolean().describe('Whether the value was stored as a secret'),
	scope: z.enum(['project', 'org']).describe('The scope where the variable was set'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set an environment variable or secret',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('env set NODE_ENV production'),
			description: 'Set environment variable',
		},
		{ command: getCommand('env set PORT 3000'), description: 'Set port number' },
		{
			command: getCommand('env set API_KEY "sk_..." --secret'),
			description: 'Set a secret value',
		},
		{
			command: getCommand('env set OPENAI_API_KEY "sk_..." --secret --org'),
			description: 'Set an organization-wide secret',
		},
	],
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable key'),
			value: z.string().describe('the environment variable value'),
		}),
		options: z.object({
			secret: z
				.boolean()
				.default(false)
				.describe('store as a secret (encrypted and masked in UI)'),
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe(
					'set at organization level (use --org for default org, or --org <orgId> for specific org)'
				),
		}),
		response: EnvSetResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, apiClient, project, projectDir, config } = ctx;
		const useOrgScope = isOrgScope(opts?.org);

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		let isSecret = opts?.secret ?? false;
		const isPublic = isPublicVarKey(args.key);

		// Validate key doesn't start with reserved AGENTUITY_ prefix (except AGENTUITY_PUBLIC_)
		if (isReservedAgentuityKey(args.key)) {
			tui.fatal('Cannot set AGENTUITY_ prefixed variables. These are reserved for system use.');
		}

		// Validate public vars cannot be secrets
		if (isSecret && isPublic) {
			tui.fatal(
				`Cannot set public variables as secrets. Keys with prefixes (${PUBLIC_VAR_PREFIXES.join(', ')}) are exposed to the frontend.`
			);
		}

		// Auto-detect if this looks like a secret and offer to store as secret
		// Skip auto-detect for public vars since they can never be secrets
		if (!isSecret && !isPublic && looksLikeSecret(args.key, args.value)) {
			tui.warning(`The variable '${args.key}' looks like it should be a secret.`);

			const storeAsSecret = await tui.confirm('Store as a secret instead?', true);

			if (storeAsSecret) {
				isSecret = true;
			}
		}

		const label = isSecret ? 'secret' : 'environment variable';

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			const updatePayload = isSecret
				? { id: orgId, secrets: { [args.key]: args.value } }
				: { id: orgId, env: { [args.key]: args.value } };

			await tui.spinner(`Setting organization ${label} in cloud`, () => {
				return orgEnvUpdate(apiClient, updatePayload);
			});

			tui.success(
				`Organization ${isSecret ? 'secret' : 'environment variable'} '${args.key}' set successfully (affects all projects in org)`
			);

			return {
				success: true,
				key: args.key,
				secret: isSecret,
				scope: 'org' as const,
			};
		} else {
			// Project scope (existing behavior)
			const updatePayload = isSecret
				? { id: project!.projectId, secrets: { [args.key]: args.value } }
				: { id: project!.projectId, env: { [args.key]: args.value } };

			await tui.spinner(`Setting ${label} in cloud`, () => {
				return projectEnvUpdate(apiClient, updatePayload);
			});

			// Update local .env file only if we have a project directory
			// (not when using --project-id without being in a project folder)
			let envFilePath: string | undefined;
			if (projectDir) {
				envFilePath = await findExistingEnvFile(projectDir);
				const currentEnv = await readEnvFile(envFilePath);
				currentEnv[args.key] = args.value;

				// Filter out AGENTUITY_ keys before writing
				const filteredEnv = filterAgentuitySdkKeys(currentEnv);
				await writeEnvFile(envFilePath, filteredEnv);
			}

			const successMsg = envFilePath
				? `${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' set successfully (cloud + ${envFilePath})`
				: `${isSecret ? 'Secret' : 'Environment variable'} '${args.key}' set successfully (cloud only)`;
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
