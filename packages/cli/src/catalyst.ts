import { getServiceUrls } from '@agentuity/server';

/**
 * Get the catalyst URL for a specific region.
 * The catalyst can resolve any prefixed ID (sbx_, proj_, org_, etc.)
 * without requiring org context.
 */
export function getCatalystUrl(
	region: string,
	overrides?: { catalyst_url?: string } | null
): string {
	// Allow override via environment variable for testing/development
	if (process.env.AGENTUITY_CATALYST_URL) {
		return process.env.AGENTUITY_CATALYST_URL;
	}

	// Allow override via profile config (e.g., local profile)
	if (overrides?.catalyst_url) {
		return overrides.catalyst_url;
	}

	// Regional catalyst endpoint (with existing transport/local handling)
	return getServiceUrls(region).catalyst;
}
