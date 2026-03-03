import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectEnvUpdate, orgEnvUpdate } from '@agentuity/server';
import {
	looksLikeSecret,
	isReservedAgentuityKey,
	isPublicVarKey,
	PUBLIC_VAR_PREFIXES,
} from '../../../env-util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { resolveOrgId, isOrgScope } from './org-util.ts';

interface ParsedEnvPair {
	key: string;
	value: string;
}

/**
 * Parse env set arguments into key-value pairs.
 * Supports two formats:
 * - Legacy: KEY VALUE (exactly 2 args)
 * - KEY=VALUE format: KEY1=VALUE1 [KEY2=VALUE2 ...]
 */
function parseEnvArgs(rawArgs: string[]): ParsedEnvPair[] {
	if (rawArgs.length === 0) {
		tui.fatal(
			'No arguments provided. Usage: env set KEY VALUE or env set KEY=VALUE [KEY2=VALUE2 ...]'
		);
	}

	// Check if first arg contains '=' — if so, treat ALL args as KEY=VALUE format
	const firstArg = rawArgs[0]!;
	if (firstArg.includes('=')) {
		const pairs: ParsedEnvPair[] = [];
		for (const arg of rawArgs) {
			const eqIndex = arg.indexOf('=');
			if (eqIndex === -1 || eqIndex === 0) {
				tui.fatal(`Invalid format: '${arg}'. Expected KEY=VALUE format.`);
			}
			const key = arg.substring(0, eqIndex);
			const value = arg.substring(eqIndex + 1);
			if (!key) {
				tui.fatal(`Invalid format: '${arg}'. Key cannot be empty.`);
			}
			pairs.push({ key, value });
		}
		return pairs;
	}

	// Legacy format: exactly 2 args = KEY VALUE
	if (rawArgs.length === 2) {
		const key = rawArgs[0]!.trim();
		if (!key) {
			tui.fatal(
				'Invalid format: key cannot be empty. Usage: env set KEY VALUE or env set KEY=VALUE'
			);
		}
		return [{ key, value: rawArgs[1]! }];
	}

	// Ambiguous: 1 arg without '=' or 3+ args without '='
	if (rawArgs.length === 1) {
		tui.fatal(`Missing value for '${rawArgs[0]}'. Usage: env set KEY VALUE or env set KEY=VALUE`);
	}

	// 3+ args without '=' in first arg
	tui.fatal(
		'Multiple variables must use KEY=VALUE format. Usage: env set KEY1=VALUE1 KEY2=VALUE2 ...'
	);
}

const EnvSetResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	keys: z.array(z.string()).describe('Environment variable keys that were set'),
	secretKeys: z.array(z.string()).describe('Keys that were stored as secrets'),
	envKeys: z.array(z.string()).describe('Keys that were stored as env vars'),
	scope: z.enum(['project', 'org']).describe('The scope where the variables were set'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set one or more environment variables or secrets',
	tags: ['mutating', 'updates-resource', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, apiClient: true },
	optional: { project: true },
	examples: [
		{
			command: getCommand('env set NODE_ENV production'),
			description: 'Set environment variable',
		},
		{
			command: getCommand('env set NODE_ENV=production'),
			description: 'Set using KEY=VALUE format',
		},
		{ command: getCommand('env set PORT 3000'), description: 'Set port number' },
		{
			command: getCommand('env set NODE_ENV=production LOG_LEVEL=info PORT=3000'),
			description: 'Set multiple variables at once',
		},
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
			args: z.array(z.string()).describe('KEY VALUE or KEY=VALUE [KEY2=VALUE2 ...]'),
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
		const { args: cmdArgs, opts, apiClient, project, config } = ctx;
		const useOrgScope = isOrgScope(opts?.org);
		const forceSecret = opts?.secret ?? false;

		// Require project context if not using org scope
		if (!useOrgScope && !project) {
			tui.fatal(
				'Project context required. Run from a project directory or use --org for organization scope.'
			);
		}

		const pairs = parseEnvArgs(cmdArgs.args);

		// Validate all keys first
		for (const pair of pairs) {
			if (isReservedAgentuityKey(pair.key)) {
				tui.fatal(
					`Cannot set AGENTUITY_ prefixed variables: '${pair.key}'. These are reserved for system use.`
				);
			}
		}

		// Reject duplicate keys
		const seenKeys = new Set<string>();
		for (const pair of pairs) {
			if (seenKeys.has(pair.key)) {
				tui.fatal(`Duplicate key '${pair.key}'. Each variable may only be specified once.`);
			}
			seenKeys.add(pair.key);
		}

		// Classify each pair as env or secret
		const envPairs: Record<string, string> = {};
		const secretPairs: Record<string, string> = {};
		const secretKeysList: string[] = [];
		const envKeysList: string[] = [];

		for (const pair of pairs) {
			const isPublic = isPublicVarKey(pair.key);
			let isSecret = forceSecret;

			// Validate public vars cannot be secrets
			if (isSecret && isPublic) {
				tui.fatal(
					`Cannot set public variables as secrets. '${pair.key}' (prefix ${PUBLIC_VAR_PREFIXES.join(', ')}) is exposed to the frontend.`
				);
			}

			// Auto-detect if this looks like a secret and offer to store as secret
			// Skip auto-detect for public vars since they can never be secrets
			if (!isSecret && !isPublic && looksLikeSecret(pair.key, pair.value)) {
				if (pairs.length === 1) {
					// Single pair: offer interactive prompt (existing behavior)
					tui.warning(`The variable '${pair.key}' looks like it should be a secret.`);
					const storeAsSecret = await tui.confirm('Store as a secret instead?', true);
					if (storeAsSecret) {
						isSecret = true;
					}
				} else {
					// Multiple pairs: auto-detect silently
					isSecret = true;
					tui.info(`Auto-detected '${pair.key}' as a secret`);
				}
			}

			if (isSecret) {
				secretPairs[pair.key] = pair.value;
				secretKeysList.push(pair.key);
			} else {
				envPairs[pair.key] = pair.value;
				envKeysList.push(pair.key);
			}
		}

		const totalCount = pairs.length;
		const allKeys = [...envKeysList, ...secretKeysList];
		const secretSuffix =
			secretKeysList.length > 0
				? ` (${secretKeysList.length} secret${secretKeysList.length !== 1 ? 's' : ''})`
				: '';

		if (useOrgScope) {
			// Organization scope
			const orgId = await resolveOrgId(apiClient, config, opts!.org!);

			const updatePayload: {
				id: string;
				env?: Record<string, string>;
				secrets?: Record<string, string>;
			} = { id: orgId };
			if (Object.keys(envPairs).length > 0) updatePayload.env = envPairs;
			if (Object.keys(secretPairs).length > 0) updatePayload.secrets = secretPairs;

			await tui.spinner(
				`Setting ${totalCount} organization variable${totalCount !== 1 ? 's' : ''} in cloud`,
				() => {
					return orgEnvUpdate(apiClient, updatePayload);
				}
			);

			tui.success(
				`Organization variable${totalCount !== 1 ? 's' : ''} set successfully: ${allKeys.join(', ')}${secretSuffix}`
			);

			return {
				success: true,
				keys: allKeys,
				secretKeys: secretKeysList,
				envKeys: envKeysList,
				scope: 'org' as const,
			};
		} else {
			// Project scope
			const updatePayload: {
				id: string;
				env?: Record<string, string>;
				secrets?: Record<string, string>;
			} = { id: project!.projectId };
			if (Object.keys(envPairs).length > 0) updatePayload.env = envPairs;
			if (Object.keys(secretPairs).length > 0) updatePayload.secrets = secretPairs;

			await tui.spinner(
				`Setting ${totalCount} variable${totalCount !== 1 ? 's' : ''} in cloud`,
				() => {
					return projectEnvUpdate(apiClient, updatePayload);
				}
			);

			tui.success(
				`Variable${totalCount !== 1 ? 's' : ''} set successfully: ${allKeys.join(', ')}${secretSuffix}`
			);

			return {
				success: true,
				keys: allKeys,
				secretKeys: secretKeysList,
				envKeys: envKeysList,
				scope: 'project' as const,
			};
		}
	},
});
