#!/usr/bin/env bun
/**
 * Helper script to compute service URLs from profile config
 * Outputs environment variables that can be sourced by bash
 */

import { getServiceUrls } from '../../../../packages/server/src/index';
import { loadConfig } from '../../../../packages/cli/src/config';

async function main() {
	// Load config to get region
	let region = process.env.AGENTUITY_REGION;

	if (!region) {
		try {
			const config = await loadConfig();
			region = config.region || 'local';
		} catch {
			// Default to local if no config
			region = 'local';
		}
	}

	// Get service URLs for the region
	const serviceUrls = getServiceUrls(region);

	// Output as environment variable exports for bash
	console.log(`export AGENTUITY_TRANSPORT_URL="${serviceUrls.catalyst}"`);
	console.log(`export AGENTUITY_KEYVALUE_URL="${serviceUrls.keyvalue}"`);
	console.log(`export AGENTUITY_STREAM_URL="${serviceUrls.stream}"`);
	console.log(`export AGENTUITY_VECTOR_URL="${serviceUrls.vector}"`);
	console.log(`export AGENTUITY_CATALYST_URL="${serviceUrls.catalyst}"`);
	console.log(`export AGENTUITY_OTLP_URL="${serviceUrls.otel}"`);
}

main().catch((error) => {
	console.error('Failed to get service URLs:', error);
	process.exit(1);
});
