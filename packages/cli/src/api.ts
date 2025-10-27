/**
 * API Client for Agentuity Platform
 *
 * Handles HTTP requests to the API with automatic error parsing and User-Agent headers.
 *
 * Error handling:
 * - UPGRADE_REQUIRED (409): Throws UpgradeRequiredError
 * - Other errors: Throws Error with API message or status text
 *
 * See api-errors.md for full documentation.
 */

import type { Config } from './types';
import { getVersion, getRevision } from './version';

interface APIErrorResponse {
	success: boolean;
	code?: string;
	message: string;
	details?: Record<string, unknown>;
}

function getUserAgent(config?: Config | null): string {
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

export class UpgradeRequiredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UpgradeRequiredError';
	}
}

export class APIClient {
	constructor(
		private baseUrl: string,
		private apiKey?: string,
		private config?: Config | null
	) {}

	async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'User-Agent': getUserAgent(this.config),
		};

		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const responseBody = await response.text();

			// Try to parse error response
			let errorData: APIErrorResponse | null = null;
			try {
				errorData = JSON.parse(responseBody) as APIErrorResponse;
			} catch {
				// Not JSON, ignore
			}

			if (process.env.DEBUG) {
				// Sanitize headers to avoid leaking API keys
				const sanitizedHeaders = { ...headers };
				for (const key in sanitizedHeaders) {
					if (key.toLowerCase() === 'authorization') {
						sanitizedHeaders[key] = 'REDACTED';
					}
				}

				console.error('API Error Details:');
				console.error('  URL:', url);
				console.error('  Method:', method);
				console.error('  Status:', response.status, response.statusText);
				console.error('  Headers:', JSON.stringify(sanitizedHeaders, null, 2));
				console.error('  Response:', responseBody);
			}

			// Check for UPGRADE_REQUIRED error
			if (errorData?.code === 'UPGRADE_REQUIRED') {
				// Skip version check in development
				if (shouldSkipVersionCheck(this.config)) {
					if (process.env.DEBUG) {
						console.error(
							'[DEBUG] Skipping version check (flag/env/config override or dev mode)'
						);
					}
					// Continue as if there was no error - the server should still process the request
					// but we'll throw a different error since we can't continue with a 409
					throw new Error('Version check skipped, but request failed. Try upgrading the CLI.');
				}

				throw new UpgradeRequiredError(
					errorData.message || 'Please upgrade to the latest version of the CLI'
				);
			}

			// Throw with message from API if available
			if (errorData?.message) {
				throw new Error(errorData.message);
			}

			throw new Error(`API error: ${response.status} ${response.statusText}`);
		}

		// Successful response; handle empty bodies (e.g., 204 No Content)
		if (response.status === 204) {
			return undefined as T;
		}
		const contentLength = response.headers.get('content-length');
		if (contentLength === '0') {
			return undefined as T;
		}
		return response.json() as Promise<T>;
	}
}

export function getAPIBaseURL(config?: Config | null): string {
	if (process.env.AGENTUITY_API_URL) {
		return process.env.AGENTUITY_API_URL;
	}

	const overrides = config?.overrides as { api_url?: string } | undefined;
	if (overrides?.api_url) {
		return overrides.api_url;
	}

	return 'https://api.agentuity.com';
}

export function getAppBaseURL(config?: Config | null): string {
	if (process.env.AGENTUITY_APP_URL) {
		return process.env.AGENTUITY_APP_URL;
	}

	const overrides = config?.overrides as { app_url?: string } | undefined;
	if (overrides?.app_url) {
		return overrides.app_url;
	}

	return 'https://app.agentuity.com';
}
