import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let appName: string | undefined;
let appVersion: string | undefined;
let inited = false;

export function init() {
	if (inited) {
		return;
	}
	console.log('isproduction', isProduction());
	console.log('isdevmode', isDevMode());
	console.log('environmnet', getEnvironment());
	const f = join(import.meta.dir, isProduction() ? 'package.json' : '/../package.json');
	console.log('TRYING TO READ', f);
	if (existsSync(f)) {
		try {
			const pkg = JSON.parse(readFileSync(f, 'utf-8'));
			appName = pkg.name;
			appVersion = pkg.version;
			console.log(' READ', pkg);
		} catch {
			// Fallback to defaults if parsing fails
		}
	}
	inited = true;
}

/**
 * Returns the SDK Version that was used to build this app
 *
 * @returns string
 */
export function getSDKVersion(): string {
	return process.env.AGENTUITY_CLOUD_SDK_VERSION ?? 'unknown';
}

/**
 * Returns the App Name that was used when this app was built
 *
 * @returns string
 */
export function getAppName(): string {
	init();
	return appName ?? 'unknown';
}

/**
 * Returns the App Version that was used when this app was built
 *
 * @returns string
 */
export function getAppVersion(): string {
	init();
	return appVersion ?? 'unknown';
}

/**
 * Returns the Organization ID for this app
 *
 * @returns string
 */
export function getOrganizationId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_ORG_ID;
}

/**
 * Returns the Project ID for this app
 *
 * @returns string
 */
export function getProjectId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_PROJECT_ID;
}

/**
 * Returns the Deployment ID for this app that was deployed
 *
 * @returns string | undefined
 */
export function getDeploymentId(): string | undefined {
	return process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
}

/**
 * Returns true if the app is running in dev mode
 *
 * @returns boolean
 */
export function isDevMode(): boolean {
	return process.env.AGENTUITY_SDK_DEV_MODE === 'true';
}

/**
 * Returns true if the app is running in production mode
 *
 * @returns boolean
 */
export function isProduction(): boolean {
	return getEnvironment() === 'production' && !isDevMode();
}

/**
 * Returns the CLI version that was used when this app was built
 *
 * @returns string
 */
export function getCLIVersion(): string {
	return process.env.AGENTUITY_CLI_VERSION ?? 'unknown';
}

/**
 * Returns the environment setting for this app
 *
 * @returns string
 */
export function getEnvironment(): string {
	return process.env.AGENTUITY_ENVIRONMENT || process.env.NODE_ENV || 'development';
}

/**
 * Returns true if the AGENTUITY_SDK_KEY is set
 *
 * @returns boolean
 */
export function isAuthenticated(): boolean {
	return !!process.env.AGENTUITY_SDK_KEY;
}

/**
 * Symbol for accessing internal runtime state.
 * Defined here to avoid circular dependency.
 */
export const AGENT_RUNTIME = Symbol('AGENT_RUNTIME');

/**
 * Symbol for accessing internal agent from AgentRunner.
 * @internal
 */
export const INTERNAL_AGENT = Symbol('INTERNAL_AGENT');

/**
 * Symbol for tracking the current executing agent (for telemetry).
 * Not exposed on public AgentContext interface.
 * @internal
 */
export const CURRENT_AGENT = Symbol('CURRENT_AGENT');

/**
 * Symbol for tracking agent IDs that have executed in this session.
 * Used in standalone contexts to track agents for session events.
 * @internal
 */
export const AGENT_IDS = Symbol('AGENT_IDS');
