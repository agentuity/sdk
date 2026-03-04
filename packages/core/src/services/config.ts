import { getEnv } from './env.ts';
import { z } from 'zod';

export const ServiceUrlsSchema = z.object({
	keyvalue: z.string().describe('URL for the key-value storage service.'),
	stream: z.string().describe('URL for the stream service.'),
	vector: z.string().describe('URL for the vector storage service.'),
	catalyst: z.string().describe('URL for the Catalyst API gateway.'),
	otel: z.string().describe('URL for the OpenTelemetry collector.'),
	sandbox: z.string().describe('URL for the sandbox service.'),
	email: z.string().describe('URL for the email service.'),
}).describe('Service endpoint URLs for the Agentuity platform.');

export type ServiceUrls = z.infer<typeof ServiceUrlsSchema>;

/**
 * Resolve the region from the provided value or AGENTUITY_REGION environment variable.
 * Throws an error if no region can be resolved.
 */
export function resolveRegion(region?: string): string {
	const resolved = region ?? getEnv('AGENTUITY_REGION');
	if (!resolved) {
		throw new Error(
			'Region is required but not provided. Set the AGENTUITY_REGION environment variable or pass region as a parameter.'
		);
	}
	return resolved;
}

/**
 * Get service URLs from environment variables with fallback defaults.
 * Throws an error if region cannot be resolved (neither passed as parameter nor set via AGENTUITY_REGION).
 */
export function getServiceUrls(region?: string): ServiceUrls {
	const resolvedRegion = resolveRegion(region);
	const transportUrl =
		getEnv('AGENTUITY_TRANSPORT_URL') || buildRegionalURL(resolvedRegion, 'catalyst');

	return {
		keyvalue: getEnv('AGENTUITY_KEYVALUE_URL') || transportUrl,
		stream: getEnv('AGENTUITY_STREAM_URL') || buildRegionalURL(resolvedRegion, 'streams'),
		vector: getEnv('AGENTUITY_VECTOR_URL') || transportUrl,
		catalyst: getEnv('AGENTUITY_CATALYST_URL') || transportUrl,
		otel: getEnv('AGENTUITY_OTLP_URL') || buildRegionalURL(resolvedRegion, 'otel'),
		sandbox: getEnv('AGENTUITY_SANDBOX_URL') || transportUrl,
		email: getEnv('AGENTUITY_EMAIL_URL') || transportUrl,
	};
}

function getDomainSuffix(region?: string) {
	if (region === 'local' || region === 'l') {
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
