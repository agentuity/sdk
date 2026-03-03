/**
 * Shared HMAC-SHA256 signature verification for internal routes.
 * Used by cron handlers and workbench routes.
 */

import { isProduction } from './_config.ts';

// Maximum age for signatures (5 minutes)
const MAX_SIGNATURE_AGE_SECONDS = 300;

/**
 * Verifies an HMAC-SHA256 signature.
 *
 * The signature format is "v1=<64 hex chars>" where the hex payload is the
 * HMAC-SHA256 of "{timestamp}.{body}" using AGENTUITY_SDK_KEY as the key.
 *
 * In non-production environments (dev mode), this function always returns true
 * to allow local development without signature verification.
 *
 * In production, requests are rejected if AGENTUITY_SDK_KEY is not set.
 *
 * @param signature - The signature header value (format: "v1=<64 hex chars>")
 * @param timestamp - The timestamp header value (unix seconds as string)
 * @param body - The request body (empty string for GET/DELETE requests)
 * @returns true if signature is valid, or if not in production mode
 */
export async function verifySignature(
	signature: string | undefined,
	timestamp: string | undefined,
	body: string
): Promise<boolean> {
	// Skip auth in dev mode
	if (!isProduction()) {
		return true;
	}

	const sdkKey = process.env.AGENTUITY_SDK_KEY;
	if (!sdkKey) {
		// No SDK key in production is a misconfiguration — reject the request
		return false;
	}

	// If no signature headers, reject the request
	if (!signature || !timestamp) {
		return false;
	}

	// Verify timestamp is within acceptable range (prevent replay attacks)
	const ts = parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Number.isNaN(ts) || Math.abs(now - ts) > MAX_SIGNATURE_AGE_SECONDS) {
		return false;
	}

	// Validate signature format: must be 'v1=' followed by valid hex (64 chars for SHA-256)
	if (!signature.startsWith('v1=')) {
		return false;
	}
	const hexPayload = signature.slice(3);
	if (!/^[0-9a-f]{64}$/i.test(hexPayload)) {
		return false;
	}

	// Decode hex payload into Uint8Array
	const incomingSigBytes = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		incomingSigBytes[i] = parseInt(hexPayload.slice(i * 2, i * 2 + 2), 16);
	}

	// Verify the signature using constant-time comparison
	const message = `${ts}.${body}`;
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(sdkKey),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);

	return crypto.subtle.verify('HMAC', key, incomingSigBytes, encoder.encode(message));
}
