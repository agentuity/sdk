export interface ServiceUrls {
	keyvalue: string;
	objectstore: string;
	stream: string;
	vector: string;
	catalyst: string;
}

/**
 * Get service URLs from environment variables with fallback defaults
 */
export function getServiceUrls(region?: string): ServiceUrls {
	const transportUrl = process.env.AGENTUITY_TRANSPORT_URL || buildRegionalURL(region, 'catalyst');

	return {
		keyvalue: process.env.AGENTUITY_KEYVALUE_URL || transportUrl,
		objectstore: process.env.AGENTUITY_OBJECTSTORE_URL || transportUrl,
		stream: process.env.AGENTUITY_STREAM_URL || buildRegionalURL(region, 'streams'),
		vector: process.env.AGENTUITY_VECTOR_URL || transportUrl,
		catalyst: process.env.AGENTUITY_CATALYST_URL || transportUrl,
	};
}

function getDomainSuffix(region?: string) {
	if (region === 'local') {
		return 'agentuity.io';
	}
	return 'agentuity.cloud';
}

function buildRegionalURL(region?: string, hostname?: string) {
	const suffix = getDomainSuffix(region);
	if (suffix === 'agentuity.io') {
		return `https://${hostname}.${suffix}`;
	}
	return `https://${hostname}-${region}.${suffix}`;
}
