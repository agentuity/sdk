import { getServiceUrls } from '@agentuity/server/index.ts';

/**
 * Get the catalyst URL for a specific region.
 * The catalyst can resolve any prefixed ID (sbx_, proj_, org_, etc.)
 * without requiring org context.
 */
export function getCatalystUrl(region: string): string {
	// Allow override via environment variable for testing/development
	if (process.env.AGENTUITY_CATALYST_URL) {
		return process.env.AGENTUITY_CATALYST_URL;
	}

	// Regional catalyst endpoint (with existing transport/local handling)
	return getServiceUrls(region).catalyst;
}
