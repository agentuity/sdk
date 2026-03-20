import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet, orgEnvGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { resolveOrgId, isOrgScope } from './org-util';

const EnvGetResponseSchema = z.object({
	key: z.string().describe('Environment variable key name'),
	value: z.string().describe('Environment variable value'),
	secret: z.boolean().describe('Whether the value is stored as a secret'),
	scope: z.enum(['project', 'org']).describe('The scope where the variable was found'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show', 'info'],
	description: 'Get an environment variable or secret value',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('env get NODE_ENV'), description: 'Get environment variable' },
		{ command: getCommand('env get API_KEY'), description: 'Get a secret value' },
		{ command: getCommand('env get API_KEY --no-mask'), description: 'Show unmasked value' },
		{
			command: getCommand('env get OPENAI_API_KEY --org'),
			description: 'Get org-level variable',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable or secret key'),
		}),
		options: z.object({
			maskSecret: z.boolean().optional().describe('mask the secret value in output'),
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe(
					'get from organization level (use --org for default org, or --org <orgId> for specific org)'
				),
		}),
		response: EnvGetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, apiClient, project, options, config } = ctx;
		const useOrgScope = isOrgScope(opts?.org);

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		let value: string | undefined;
		let isSecret = false;
		let scope: 'project' | 'org';

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			const orgData = await tui.spinner('Fetching organization variable', () => {
				return orgEnvGet(apiClient, { id: orgId, mask: false });
			});

			if (orgData.secrets?.[args.key] !== undefined) {
				value = orgData.secrets[args.key];
				isSecret = true;
			} else if (orgData.env?.[args.key] !== undefined) {
				value = orgData.env[args.key];
				isSecret = false;
			}

			scope = 'org';
		} else {
			// Project scope
			const projectData = await tui.spinner('Fetching variable', () => {
				return projectGet(apiClient, { id: project!.projectId, mask: false });
			});

			if (projectData.secrets?.[args.key] !== undefined) {
				value = projectData.secrets[args.key];
				isSecret = true;
			} else if (projectData.env?.[args.key] !== undefined) {
				value = projectData.env[args.key];
				isSecret = false;
			}

			scope = 'project';
		}

		if (value === undefined) {
			tui.fatal(`Variable '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// Mask secrets by default, env vars are never masked
		const shouldMask = isSecret && (opts?.maskSecret ?? true);

		if (!options.json) {
			const displayValue = shouldMask ? tui.maskSecret(value) : value;
			const typeLabel = isSecret ? ' (secret)' : '';
			const scopeLabel = useOrgScope ? ' [org]' : '';
			tui.success(`${args.key}=${displayValue}${typeLabel}${scopeLabel}`);
		}

		return {
			key: args.key,
			value,
			secret: isSecret,
			scope,
		};
	},
});
