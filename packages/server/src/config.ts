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
export function getServiceUrls(): ServiceUrls {
	const transportUrl = process.env.AGENTUITY_TRANSPORT_URL || 'https://agentuity.ai';

	return {
		keyvalue: process.env.AGENTUITY_KEYVALUE_URL || transportUrl,
		objectstore: process.env.AGENTUITY_OBJECTSTORE_URL || transportUrl,
		stream: process.env.AGENTUITY_STREAM_URL || 'https://streams.agentuity.cloud',
		vector: process.env.AGENTUITY_VECTOR_URL || transportUrl,
		catalyst: transportUrl,
	};
}
