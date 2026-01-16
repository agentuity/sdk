/**
 * Runtime environment bootstrapping utility
 *
 * Simplified bootstrap that sets up service URLs based on environment.
 * Does not depend on CLI config files or .env file parsing.
 */

import { getServiceUrls } from './config';

export interface RuntimeBootstrapOptions {
	/**
	 * Project directory (reserved for future use)
	 * @default process.cwd()
	 */
	projectDir?: string;

	/**
	 * Override the active profile
	 */
	profile?: string;
}

/**
 * Bootstrap runtime environment by setting service URLs.
 *
 * This function:
 * 1. Sets AGENTUITY_REGION=local for local/development environments
 * 2. Sets service URLs based on AGENTUITY_REGION
 * 3. Propagates profile name to environment
 *
 * Note: This does NOT load .env files. Use a proper .env loader
 * (like dotenv) in your app.ts before calling this function.
 *
 * Call this BEFORE createApp() in your app.ts:
 *
 * @example
 * ```ts
 * import { bootstrapRuntimeEnv } from '@agentuity/server';
 * import { createApp } from '@agentuity/runtime';
 *
 * // Set up service URLs
 * bootstrapRuntimeEnv();
 *
 * // Now createApp() will use the correct env vars
 * const app = await createApp();
 * ```
 */
export function bootstrapRuntimeEnv(options: RuntimeBootstrapOptions = {}): void {
	const profile = options.profile || process.env.AGENTUITY_PROFILE || 'local';

	// For local/development, default AGENTUITY_REGION to 'local'
	if (
		(profile === 'local' || process.env.NODE_ENV === 'development') &&
		!process.env.AGENTUITY_REGION
	) {
		process.env.AGENTUITY_REGION = 'local';
	}

	// Propagate profile name into env for consistency
	if (!process.env.AGENTUITY_PROFILE) {
		process.env.AGENTUITY_PROFILE = profile;
	}

	// Set service URLs based on region
	const region = process.env.AGENTUITY_REGION;
	const serviceUrls = getServiceUrls(region);

	// Only set if not already defined (env vars from shell/CI take precedence)
	if (!process.env.AGENTUITY_TRANSPORT_URL) {
		process.env.AGENTUITY_TRANSPORT_URL = serviceUrls.catalyst;
	}
	if (!process.env.AGENTUITY_KEYVALUE_URL) {
		process.env.AGENTUITY_KEYVALUE_URL = serviceUrls.keyvalue;
	}
	if (!process.env.AGENTUITY_SANDBOX_URL) {
		process.env.AGENTUITY_SANDBOX_URL = serviceUrls.sandbox;
	}
	if (!process.env.AGENTUITY_STREAM_URL) {
		process.env.AGENTUITY_STREAM_URL = serviceUrls.stream;
	}
	if (!process.env.AGENTUITY_VECTOR_URL) {
		process.env.AGENTUITY_VECTOR_URL = serviceUrls.vector;
	}
	if (!process.env.AGENTUITY_CATALYST_URL) {
		process.env.AGENTUITY_CATALYST_URL = serviceUrls.catalyst;
	}
	if (!process.env.AGENTUITY_OTLP_URL) {
		process.env.AGENTUITY_OTLP_URL = serviceUrls.otel;
	}
}
