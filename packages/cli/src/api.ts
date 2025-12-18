/**
 * CLI-specific API client wrapper
 *
 * Re-exports from @agentuity/server with CLI-specific configuration
 */

import type { Config, Logger } from './types';
import { getVersion, getRevision } from './version';
import {
	APIClient as BaseAPIClient,
	getAPIBaseURL as baseGetAPIBaseURL,
	getAppBaseURL as baseGetAppBaseURL,
	type APIClientConfig,
} from '@agentuity/server';

export function getUserAgent(config?: Config | null): string {
	// If we're skipping version check, send "dev" to signal the server to skip too
	let version = getVersion();
	if (shouldSkipVersionCheck(config)) {
		version = 'dev';
	}

	const revision = getRevision();
	return `Agentuity CLI/${version} (${revision})`;
}

function shouldSkipVersionCheck(config?: Config | null): boolean {
	// Priority order:
	// 1. CLI flag (set via env var in cli.ts)
	// 2. Environment variable
	// 3. Config override
	// 4. Auto-detection (dev/0.0.x versions)

	// Skip if environment variable is set (includes CLI flag)
	if (
		process.env.AGENTUITY_SKIP_VERSION_CHECK === '1' ||
		process.env.AGENTUITY_SKIP_VERSION_CHECK === 'true'
	) {
		return true;
	}

	// Check config overrides
	const overrides = config?.overrides as { skip_version_check?: boolean } | undefined;
	if (overrides?.skip_version_check === true) {
		return true;
	}

	// Skip if version is 'dev' or starts with '0.0.' (pre-release/local development)
	const version = getVersion();
	if (version === 'dev' || version.startsWith('0.0.')) {
		return true;
	}

	return false;
}

// CLI-specific wrapper around the base APIClient
export class APIClient extends BaseAPIClient {
	constructor(baseUrl: string, logger: Logger, config?: Config | null);
	constructor(baseUrl: string, logger: Logger, apiKey: string, config?: Config | null);
	constructor(
		baseUrl: string,
		logger: Logger,
		apiKeyOrConfig?: string | Config | null,
		config?: Config | null
	) {
		const clientConfig: APIClientConfig = {
			skipVersionCheck: shouldSkipVersionCheck(
				typeof apiKeyOrConfig === 'string' ? config : apiKeyOrConfig
			),
			userAgent: getUserAgent(typeof apiKeyOrConfig === 'string' ? config : apiKeyOrConfig),
		};

		if (typeof apiKeyOrConfig === 'string') {
			super(baseUrl, logger, apiKeyOrConfig, clientConfig);
		} else {
			if (apiKeyOrConfig?.auth?.api_key) {
				super(baseUrl, logger, apiKeyOrConfig.auth.api_key, clientConfig);
			} else {
				super(baseUrl, logger, clientConfig);
			}
		}
	}
}

export function getAPIBaseURL(config?: Config | null): string {
	const overrides = config?.overrides as { api_url?: string } | undefined;
	return baseGetAPIBaseURL(config?.name, overrides);
}

export function getAppBaseURL(config?: Config | null): string {
	const overrides = config?.overrides as { app_url?: string } | undefined;
	return baseGetAppBaseURL(config?.name, overrides);
}

export function getGravityDevModeURL(region: string, config?: Config | null): string {
	const overrides = config?.overrides as { gravity_url?: string } | undefined;
	if (overrides?.gravity_url) {
		return overrides.gravity_url;
	}
	if (config?.name === 'local') {
		return 'grpc://gravity.agentuity.io:8443';
	}
	return `grpc://gravity-${region}.agentuity.cloud`;
}
