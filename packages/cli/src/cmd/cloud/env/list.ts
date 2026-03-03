import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectGet, orgEnvGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix.ts';
import { resolveOrgId, isOrgScope } from './org-util.ts';

const EnvItemSchema = z.object({
	value: z.string().describe('Variable value'),
	secret: z.boolean().describe('Whether this is a secret'),
	scope: z.enum(['project', 'org']).describe('The scope of the variable'),
});

const EnvListResponseSchema = z.record(z.string(), EnvItemSchema);

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all environment variables and secrets',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('env list'), description: 'List all variables (project + org merged)' },
		{ command: getCommand('env list --no-mask'), description: 'Show unmasked values' },
		{ command: getCommand('env list --secrets'), description: 'List only secrets' },
		{ command: getCommand('env list --env-only'), description: 'List only env vars' },
		{
			command: getCommand('env list --org'),
			description: 'List only organization-level variables',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	idempotent: true,
	schema: {
		options: z.object({
			mask: z
				.boolean()
				.default(true)
				.describe('mask secret values in output (use --no-mask to show values)'),
			secrets: z.boolean().default(false).describe('list only secrets'),
			'env-only': z.boolean().default(false).describe('list only environment variables'),
			org: z
				.union([z.boolean(), z.string()])
				.optional()
				.describe('list organization-level variables only (use --org for default org)'),
			orgId: z.string().optional().describe('filter by organization id'),
			projectId: z.string().optional().describe('filter by project id'),
		}),
		response: EnvListResponseSchema,
	},
	webUrl: (ctx) => {
		// If --org flag is used, link to org settings; otherwise link to project settings
		if (ctx.opts?.org) {
			return `/settings/organization/env`;
		}
		return ctx.project
			? `/projects/${encodeURIComponent(ctx.project.projectId)}/settings`
			: undefined;
	},

	async handler(ctx) {
		const { opts, apiClient, project, options, config } = ctx;

		if (opts?.orgId && opts?.projectId) {
			tui.fatal('--org-id and --project-id are mutually exclusive. Use one or the other.');
		}

		const useOrgScope = isOrgScope(opts?.org) || !!opts?.orgId;

		// Build combined result with type info and scope
		const result: Record<string, { value: string; secret: boolean; scope: 'project' | 'org' }> =
			{};

		// Filter based on options
		const showEnv = !opts?.secrets;
		const showSecrets = !opts?.['env-only'];

		if (useOrgScope) {
			// Organization scope only
			const orgId =
				opts?.orgId ??
				(opts?.org ? await resolveOrgId(apiClient, config, opts.org) : undefined);
			if (!orgId) {
				tui.fatal('Organization ID is required. Use --org-id or --org flag.');
			}

			const orgData = await tui.spinner('Fetching organization variables', () => {
				return orgEnvGet(apiClient, { id: orgId, mask: false });
			});

			const orgEnv = orgData.env || {};
			const orgSecrets = orgData.secrets || {};

			if (showEnv) {
				for (const [key, value] of Object.entries(orgEnv)) {
					result[key] = { value, secret: false, scope: 'org' };
				}
			}

			if (showSecrets) {
				for (const [key, value] of Object.entries(orgSecrets)) {
					result[key] = { value, secret: true, scope: 'org' };
				}
			}
		} else if (opts?.projectId || project) {
			// Project context: show merged view (org + project, project takes precedence)
			// First, get project's org ID and fetch org env
			const effectiveProjectId = opts?.projectId || project!.projectId;
			const projectData = await tui.spinner('Fetching variables', () => {
				return projectGet(apiClient, { id: effectiveProjectId, mask: false });
			});

			const projectEnv = projectData.env || {};
			const projectSecrets = projectData.secrets || {};

			// Try to get org-level env (may fail if no access, that's ok)
			let orgEnv: Record<string, string> = {};
			let orgSecrets: Record<string, string> = {};

			if (projectData.orgId) {
				try {
					const orgData = await orgEnvGet(apiClient, { id: projectData.orgId, mask: false });
					orgEnv = orgData.env || {};
					orgSecrets = orgData.secrets || {};
				} catch {
					// Ignore errors - user may not have org env access
				}
			}

			// Add org-level first (will be overridden by project-level)
			if (showEnv) {
				for (const [key, value] of Object.entries(orgEnv)) {
					result[key] = { value, secret: false, scope: 'org' };
				}
			}
			if (showSecrets) {
				for (const [key, value] of Object.entries(orgSecrets)) {
					result[key] = { value, secret: true, scope: 'org' };
				}
			}

			// Add project-level (overrides org-level)
			if (showEnv) {
				for (const [key, value] of Object.entries(projectEnv)) {
					result[key] = { value, secret: false, scope: 'project' };
				}
			}
			if (showSecrets) {
				for (const [key, value] of Object.entries(projectSecrets)) {
					result[key] = { value, secret: true, scope: 'project' };
				}
			}
		} else {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		// Skip TUI output in JSON mode
		if (!options.json) {
			if (Object.keys(result).length === 0) {
				tui.info('No variables found');
			} else {
				tui.newline();

				const projectCount = Object.values(result).filter((v) => v.scope === 'project').length;
				const orgCount = Object.values(result).filter((v) => v.scope === 'org').length;
				const secretCount = Object.values(result).filter((v) => v.secret).length;
				const envCount = Object.values(result).filter((v) => !v.secret).length;

				const parts: string[] = [];
				if (envCount > 0) parts.push(`${envCount} env`);
				if (secretCount > 0) parts.push(`${secretCount} secret${secretCount !== 1 ? 's' : ''}`);
				if (!useOrgScope && projectCount > 0 && orgCount > 0) {
					parts.push(`${projectCount} project, ${orgCount} org`);
				}

				tui.info(`Variables (${parts.join(', ')}):`);
				tui.newline();

				const sortedKeys = Object.keys(result).sort();
				const shouldMask = opts?.mask !== false;

				for (const key of sortedKeys) {
					const entry = result[key];
					if (!entry) continue;
					const { value, secret, scope } = entry;
					const displayValue = shouldMask && secret ? tui.maskSecret(value) : value;
					const typeIndicator = secret ? ' [secret]' : '';
					const scopeIndicator = !useOrgScope ? ` [${scope}]` : '';
					console.log(
						`${tui.bold(key)}=${displayValue}${tui.muted(typeIndicator + scopeIndicator)}`
					);
				}
			}
		}

		return result;
	},
});
