import enquirer from 'enquirer';
import { getDefaultConfigPath, getAuth, saveConfig, loadConfig, saveOrgId } from './config';
import { getResourceInfo, type ResourceType } from './cache';
import { getCommand } from './command-prefix';
import type { CommandContext, AuthData, Config } from './types';
import * as tui from './tui';
import { defaultProfileName } from './config';
import { listOrganizations } from '@agentuity/server';
import { APIClient, getAPIBaseURL, getAppBaseURL, type APIClient as APIClientType } from './api';

export function isTTY(): boolean {
	return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

const ORG_ID_ENV_VAR = 'AGENTUITY_CLOUD_ORG_ID';
const NON_INTERACTIVE_ORG_ERROR =
	'Cannot select organization in non-interactive mode. ' +
	`Use --org-id, set ${ORG_ID_ENV_VAR}, or run interactively.`;

const RESOURCE_PREFIXES: Array<{ prefix: string; type: ResourceType }> = [
	{ prefix: 'sbx_', type: 'sandbox' },
	{ prefix: 'proj_', type: 'project' },
	{ prefix: 'db_', type: 'db' },
	{ prefix: 'deploy_', type: 'deployment' },
	{ prefix: 'machine_', type: 'machine' },
	{ prefix: 'que_', type: 'queue' },
	{ prefix: 'vec_', type: 'vector' },
	{ prefix: 'kv_', type: 'kv' },
	{ prefix: 'stream_', type: 'stream' },
	{ prefix: 'eaddr_', type: 'email' },
	{ prefix: 'edest_', type: 'email' },
	{ prefix: 'ein_', type: 'email' },
	{ prefix: 'eout_', type: 'email' },
	{ prefix: 'edlv_', type: 'email' },
	{ prefix: 'wh_', type: 'webhook' },
	{ prefix: 'task_', type: 'task' },
];

function getResourceTypeFromId(id: string): ResourceType | undefined {
	for (const entry of RESOURCE_PREFIXES) {
		if (id.startsWith(entry.prefix)) {
			return entry.type;
		}
	}
	return undefined;
}

function collectPrefixedIds(values?: Record<string, unknown> | unknown[]): string[] {
	if (!values) {
		return [];
	}
	const ids = new Set<string>();
	const addValue = (value: unknown) => {
		if (typeof value === 'string') {
			const resourceType = getResourceTypeFromId(value);
			if (resourceType) {
				ids.add(value);
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (typeof entry === 'string') {
					const resourceType = getResourceTypeFromId(entry);
					if (resourceType) {
						ids.add(entry);
					}
				}
			}
		}
	};

	for (const value of Object.values(values)) {
		addValue(value);
	}

	return Array.from(ids);
}

export function hasPrefixedResourceId(
	args?: Record<string, unknown> | unknown[],
	opts?: Record<string, unknown> | unknown[]
): boolean {
	return collectPrefixedIds(args).length > 0 || collectPrefixedIds(opts).length > 0;
}

async function resolveCachedOrgId(ctx: {
	config: Config | null;
	args?: Record<string, unknown> | unknown[];
	opts?: Record<string, unknown> | unknown[];
}): Promise<string | undefined> {
	const profileName = ctx.config?.name ?? defaultProfileName;
	const candidateIds = [...collectPrefixedIds(ctx.args), ...collectPrefixedIds(ctx.opts)];

	for (const candidateId of candidateIds) {
		const resourceType = getResourceTypeFromId(candidateId);
		if (!resourceType) {
			continue;
		}
		const cachedInfo = await getResourceInfo(resourceType, profileName, candidateId);
		if (cachedInfo?.orgId) {
			return cachedInfo.orgId;
		}
	}

	return undefined;
}

export async function resolveOrgIdWithoutPrompt(ctx: {
	options: { orgId?: string | boolean };
	config: Config | null;
	args?: Record<string, unknown> | unknown[];
	opts?: Record<string, unknown> | unknown[];
}): Promise<string | undefined> {
	const { options, config, args, opts } = ctx;
	const envOrgId = process.env[ORG_ID_ENV_VAR];

	// Handle --org flag: could be true (use default), false, or a string org ID
	let flagOrgId: string | undefined;
	if (options.orgId === true) {
		// --org without argument means "use default org" - will fall through to preference/env
		flagOrgId = undefined;
	} else if (typeof options.orgId === 'string' && options.orgId !== envOrgId) {
		flagOrgId = options.orgId;
	} else {
		flagOrgId = undefined;
	}

	if (flagOrgId) {
		return flagOrgId;
	}

	if (envOrgId) {
		return envOrgId;
	}

	const preferredOrgId = config?.preferences?.orgId;
	if (preferredOrgId) {
		return preferredOrgId;
	}

	return resolveCachedOrgId({ config, args, opts });
}

export async function hasLoggedInBefore(): Promise<boolean> {
	const configPath = getDefaultConfigPath();
	return await Bun.file(configPath).exists();
}

export async function isAuthenticated(): Promise<boolean> {
	const auth = await getAuth();
	if (!auth) {
		return false;
	}
	return auth.expires > new Date();
}

export async function requireAuth(ctx: CommandContext<undefined>): Promise<AuthData> {
	const { logger } = ctx;
	const auth = await getAuth();

	if (auth && auth.expires > new Date()) {
		return auth;
	}

	const loginCmd = getCommand('auth login');
	const hasConfig = await hasLoggedInBefore();

	if (!isTTY()) {
		if (hasConfig) {
			logger.fatal(
				'You are not currently logged in or your session has expired.\n' +
					`Use "${loginCmd}" to login to Agentuity`
			);
		} else {
			logger.fatal(`Authentication required.\nUse "${loginCmd}" to create an account or login`);
		}
	}

	// Show signup benefits box
	tui.showSignupBenefits();

	// Interactive mode - show warning and confirm
	tui.warning(
		hasConfig
			? 'You are not currently logged in or your session has expired.'
			: 'Authentication required to continue.'
	);
	tui.newline();

	const shouldLogin = await tui.confirm(
		hasConfig ? 'Would you like to login now?' : 'Would you like to create an account or login?',
		true
	);

	if (!shouldLogin) {
		return tui.fatal(`Authentication required. Run "${loginCmd}" when you're ready to continue.`);
	}
	tui.newline();

	// Import and run login flow
	const { loginCommand } = await import('./cmd/auth/login');

	// Ensure apiClient and opts are available for login handler
	const loginCtx = ctx as unknown as Record<string, unknown>;
	if (!loginCtx.apiClient) {
		const apiUrl = getAPIBaseURL(ctx.config ?? null);
		loginCtx.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
	}
	loginCtx.opts ??= {};

	if (loginCommand.handler) {
		await loginCommand.handler(loginCtx as CommandContext);
	}

	// After login completes, verify we have auth
	const newAuth = await getAuth();
	if (!newAuth || newAuth.expires <= new Date()) {
		return tui.fatal('Login was not completed successfully.');
	}
	tui.newline();

	return newAuth;
}

export async function optionalAuth(
	ctx: CommandContext<undefined>,
	continueText?: string,
	skipPrompts?: boolean
): Promise<AuthData | null> {
	const auth = await getAuth();

	if (auth && auth.expires > new Date()) {
		return auth;
	}

	// Skip interactive prompts if requested (e.g., --confirm flag, --no-register in CI/scripts)
	// Still show the logged out message to inform user about limited capabilities
	if (skipPrompts) {
		if (isTTY()) {
			const hasLoggedIn = await hasLoggedInBefore();
			tui.showLoggedOutMessage(getAppBaseURL(ctx.config ?? null), hasLoggedIn);
		}
		return null;
	}

	// Show signup benefits but don't block - just return null
	if (isTTY()) {
		const config = await loadConfig();
		// check to see if we've shown the banner or logged in before
		const benefitsShown = config?.preferences?.signup_banner_shown === true;
		const hasLoggedIn = await hasLoggedInBefore();

		// if we haven't shown it, show it once and then remember that we've shown it
		if (!benefitsShown && hasLoggedIn) {
			tui.showSignupBenefits();

			if (!config) {
				ctx.config = { name: defaultProfileName };
			} else {
				ctx.config = config;
			}

			if (!ctx.config.preferences) {
				ctx.config.preferences = {};
			}
			ctx.config.preferences.signup_banner_shown = true;
			await saveConfig(ctx.config);

			// Show select menu with custom or default text
			const defaultContinueText = 'Start without an account (run locally)';
			const response = await enquirer.prompt<{ action: string }>({
				type: 'select',
				name: 'action',
				message: 'How would you like to continue?',
				choices: [
					{
						name: 'login',
						message: 'Create an account or login',
					},
					{
						name: 'local',
						message: continueText || defaultContinueText,
					},
				],
			});

			if (response.action === 'local') {
				tui.showLoggedOutMessage(getAppBaseURL(ctx.config ?? null), hasLoggedIn);
				return null;
			}

			tui.newline();

			// Import and run login flow
			const { loginCommand } = await import('./cmd/auth/login');

			// Ensure apiClient and opts are available for login handler
			const loginCtx1 = ctx as unknown as Record<string, unknown>;
			if (!loginCtx1.apiClient) {
				const apiUrl = getAPIBaseURL(ctx.config ?? null);
				loginCtx1.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
			}
			loginCtx1.opts ??= {};

			if (loginCommand.handler) {
				await loginCommand.handler(loginCtx1 as CommandContext);
			}
			return getAuth();
		}

		if (hasLoggedIn) {
			tui.warning('You are not currently logged in');
			tui.newline();
			const response = await enquirer.prompt<{ action: string }>({
				type: 'select',
				name: 'action',
				message: 'How would you like to continue?',
				choices: [
					{
						name: 'local',
						message: 'Continue without login',
					},
					{
						name: 'login',
						message: 'Login',
					},
				],
			});

			if (response.action === 'local') {
				tui.showLoggedOutMessage(getAppBaseURL(ctx.config ?? null), hasLoggedIn);
				return null;
			}

			tui.newline();

			// Import and run login flow
			const { loginCommand } = await import('./cmd/auth/login');

			// Ensure apiClient and opts are available for login handler
			const loginCtx2 = ctx as unknown as Record<string, unknown>;
			if (!loginCtx2.apiClient) {
				const apiUrl = getAPIBaseURL(ctx.config ?? null);
				loginCtx2.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
			}
			loginCtx2.opts ??= {};

			if (loginCommand.handler) {
				await loginCommand.handler(loginCtx2 as CommandContext);
			}
			return getAuth();
		}
	}

	return null;
}

export async function requireOrg(
	ctx: CommandContext & { apiClient: APIClientType },
	autoSelect?: boolean
): Promise<string> {
	const { options, config, apiClient, args, opts } = ctx as CommandContext & {
		apiClient: APIClientType;
		args?: Record<string, unknown>;
		opts?: Record<string, unknown>;
	};
	const interactive = isTTY();
	const envOrgId = process.env[ORG_ID_ENV_VAR];
	const flagOrgId = options.orgId && options.orgId !== envOrgId ? options.orgId : undefined;

	// 1. --org-id flag
	if (flagOrgId) {
		return flagOrgId;
	}

	// 2. Environment variable
	if (envOrgId) {
		return envOrgId;
	}

	// 3. Config preference (TTY: prompt with pre-selected, non-TTY: use directly)
	const preferredOrgId = config?.preferences?.orgId;
	if (preferredOrgId && (!interactive || autoSelect)) {
		return preferredOrgId;
	}

	// Cache lookup for prefixed resource IDs
	if (!preferredOrgId) {
		const cachedOrgId = await resolveCachedOrgId({ config, args, opts });
		if (cachedOrgId) {
			return cachedOrgId;
		}
	}

	// Fetch organizations
	const orgs = await tui.spinner({
		message: 'Fetching organizations',
		clearOnSuccess: true,
		callback: async () => {
			return listOrganizations(apiClient);
		},
	});

	if (orgs.length === 0) {
		tui.fatal('No organizations found for your account');
	}

	// 4. Single-org auto-select
	if (orgs.length === 1 && orgs[0]) {
		const orgId = orgs[0].id;
		if (orgId !== preferredOrgId) {
			await saveOrgId(orgId);
		}
		return orgId;
	}

	// Auto-select mode (--confirm flag or explicit autoSelect)
	if (autoSelect) {
		const orgId = await tui.selectOrganization(orgs, preferredOrgId, true);
		if (orgId !== preferredOrgId) {
			await saveOrgId(orgId);
		}
		return orgId;
	}

	// 5. Interactive prompt (TTY) / Error (no TTY)
	if (!interactive) {
		return tui.fatal(NON_INTERACTIVE_ORG_ERROR);
	}

	const orgId = await tui.selectOrganization(orgs, preferredOrgId, false);

	// Save selected org to config if different
	if (orgId !== preferredOrgId) {
		await saveOrgId(orgId);
	}

	return orgId;
}

export async function optionalOrg(
	ctx: CommandContext & { apiClient?: APIClientType; auth?: AuthData },
	autoSelect?: boolean
): Promise<string | undefined> {
	const { options, config, apiClient, auth, args, opts } = ctx as CommandContext & {
		apiClient?: APIClientType;
		auth?: AuthData;
		args?: Record<string, unknown>;
		opts?: Record<string, unknown>;
	};
	const interactive = isTTY();
	const envOrgId = process.env[ORG_ID_ENV_VAR];
	const flagOrgId = options.orgId && options.orgId !== envOrgId ? options.orgId : undefined;

	// If not authenticated or no API client, skip org selection
	if (!auth || !apiClient) {
		return undefined;
	}

	// If auth exists but has no API key, skip (likely unauthenticated or test scenario)
	if (!auth.apiKey) {
		return undefined;
	}

	// Note: --no-register check is handled in cli.ts before calling this function

	// 1. --org-id flag
	if (flagOrgId) {
		return flagOrgId;
	}

	// 2. Environment variable
	if (envOrgId) {
		return envOrgId;
	}

	// 3. Config preference (TTY: prompt with pre-selected, non-TTY: use directly)
	const preferredOrgId = config?.preferences?.orgId;
	if (preferredOrgId && (!interactive || autoSelect)) {
		return preferredOrgId;
	}

	// Cache lookup for prefixed resource IDs
	if (!preferredOrgId) {
		const cachedOrgId = await resolveCachedOrgId({ config, args, opts });
		if (cachedOrgId) {
			return cachedOrgId;
		}
	}

	// Fetch organizations
	const orgs = await tui.spinner({
		message: 'Fetching organizations',
		clearOnSuccess: true,
		callback: async () => {
			return listOrganizations(apiClient);
		},
	});

	if (orgs.length === 0) {
		return undefined;
	}

	// 4. Single-org auto-select
	if (orgs.length === 1 && orgs[0]) {
		const orgId = orgs[0].id;
		if (orgId !== preferredOrgId) {
			await saveOrgId(orgId);
		}
		return orgId;
	}

	// Auto-select mode (--confirm flag or explicit autoSelect)
	if (autoSelect) {
		const orgId = await tui.selectOrganization(orgs, preferredOrgId, true);
		if (orgId !== preferredOrgId) {
			await saveOrgId(orgId);
		}
		return orgId;
	}

	// 5. Interactive prompt (TTY) / Error (no TTY)
	if (!interactive) {
		return tui.fatal(NON_INTERACTIVE_ORG_ERROR);
	}

	// Prompt for org selection (use saved preference as initial/default)
	const orgId = await tui.selectOrganization(orgs, preferredOrgId, false);

	// Save selected org to config if different
	if (orgId !== preferredOrgId) {
		await saveOrgId(orgId);
	}

	return orgId;
}
