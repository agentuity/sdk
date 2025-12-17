import { existsSync } from 'node:fs';
import enquirer from 'enquirer';
import { getDefaultConfigDir, getAuth, saveConfig, loadConfig, saveOrgId } from './config';
import { getCommand } from './command-prefix';
import type { CommandContext, AuthData } from './types';
import * as tui from './tui';
import { defaultProfileName } from './config';
import { listOrganizations } from '@agentuity/server';
import { APIClient, getAPIBaseURL, type APIClient as APIClientType } from './api';

export function isTTY(): boolean {
	return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export function hasLoggedInBefore(): boolean {
	const configDir = getDefaultConfigDir();
	return existsSync(configDir);
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
	const hasConfig = hasLoggedInBefore();

	if (!isTTY()) {
		if (hasConfig) {
			logger.fatal(
				`You are not currently logged in or your session has expired.\n` +
					`Use "${loginCmd}" to login to Agentuity`
			);
		} else {
			logger.fatal(
				`Authentication required.\n` + `Use "${loginCmd}" to create an account or login`
			);
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

	// Ensure apiClient is available for login handler
	const loginCtx = ctx as unknown as Record<string, unknown>;
	if (!loginCtx.apiClient) {
		const apiUrl = getAPIBaseURL(ctx.config ?? null);
		loginCtx.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
	}

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
	continueText?: string
): Promise<AuthData | null> {
	const auth = await getAuth();

	if (auth && auth.expires > new Date()) {
		return auth;
	}

	// Show signup benefits but don't block - just return null
	if (isTTY()) {
		const config = await loadConfig();
		// check to see if we've shown the banner or logged in before
		const benefitsShown = config?.preferences?.signup_banner_shown === true;
		const hasLoggedIn = hasLoggedInBefore();

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
				tui.showLoggedOutMessage();
				return null;
			}

			tui.newline();

			// Import and run login flow
			const { loginCommand } = await import('./cmd/auth/login');

			// Ensure apiClient is available for login handler
			const loginCtx1 = ctx as unknown as Record<string, unknown>;
			if (!loginCtx1.apiClient) {
				const apiUrl = getAPIBaseURL(ctx.config ?? null);
				loginCtx1.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
			}

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
				tui.showLoggedOutMessage();
				return null;
			}

			tui.newline();

			// Import and run login flow
			const { loginCommand } = await import('./cmd/auth/login');

			// Ensure apiClient is available for login handler
			const loginCtx2 = ctx as unknown as Record<string, unknown>;
			if (!loginCtx2.apiClient) {
				const apiUrl = getAPIBaseURL(ctx.config ?? null);
				loginCtx2.apiClient = new APIClient(apiUrl, ctx.logger, ctx.config ?? null);
			}

			if (loginCommand.handler) {
				await loginCommand.handler(loginCtx2 as CommandContext);
			}
			return getAuth();
		}
	}

	return null;
}

export async function requireOrg(
	ctx: CommandContext & { apiClient: APIClientType }
): Promise<string> {
	const { options, config, apiClient } = ctx;

	// Check if org is provided via --org-id flag
	if (options.orgId) {
		return options.orgId;
	}

	// Check if org is saved in config preferences
	if (config?.preferences?.orgId) {
		return config.preferences.orgId;
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

	// Use selectOrganization which handles single org and prompting
	// Pass the saved preference as initial selection
	const orgId = await tui.selectOrganization(orgs, config?.preferences?.orgId);

	// Save selected org to config if different
	if (orgId !== config?.preferences?.orgId) {
		await saveOrgId(orgId);
	}

	return orgId;
}

export async function optionalOrg(
	ctx: CommandContext & { apiClient?: APIClientType; auth?: AuthData }
): Promise<string | undefined> {
	const { options, config, apiClient, auth } = ctx;

	console.log(
		'[DEBUG optionalOrg] auth:',
		!!auth,
		'apiClient:',
		!!apiClient,
		'apiKey:',
		auth?.apiKey ? 'exists' : 'missing'
	);

	// If not authenticated or no API client, skip org selection
	if (!auth || !apiClient) {
		return undefined;
	}

	// If auth exists but has no API key, skip (likely unauthenticated or test scenario)
	if (!auth.apiKey) {
		return undefined;
	}

	// Check if org is provided via --org-id flag
	if (options.orgId) {
		return options.orgId;
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

	// Always prompt for org selection (use saved preference as initial/default)
	const orgId = await tui.selectOrganization(orgs, config?.preferences?.orgId);

	// Save selected org to config if different
	if (orgId !== config?.preferences?.orgId) {
		await saveOrgId(orgId);
	}

	return orgId;
}
