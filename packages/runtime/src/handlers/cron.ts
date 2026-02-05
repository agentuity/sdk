import type { Context, Handler } from 'hono';
import { returnResponse } from '../_util';
import type { Env } from '../app';

/**
 * Handler function for cron jobs.
 * Receives the Hono context and can return any response.
 */
export type CronHandler<E extends Env = Env> = (c: Context<E>) => unknown | Promise<unknown>;

/**
 * Options for the cron middleware.
 */
export interface CronOptions {
	/**
	 * Whether to require signature authentication for cron requests.
	 * When true, requests must include valid X-Agentuity-Cron-Signature
	 * and X-Agentuity-Cron-Timestamp headers signed with the project's SDK key.
	 * Signatures are valid for 5 minutes.
	 */
	auth: boolean;
}

// Maximum age for cron signatures (5 minutes)
const MAX_SIGNATURE_AGE_SECONDS = 300;

/**
 * Verifies the cron request signature from Catalyst.
 * Returns true if signature is valid or if running in local dev mode (no SDK key).
 */
async function verifyCronSignature(c: Context, body: string): Promise<boolean> {
	const sdkKey = process.env.AGENTUITY_SDK_KEY;

	// In local dev mode (no SDK key), allow all requests
	if (!sdkKey) {
		return true;
	}

	const signature = c.req.header('X-Agentuity-Cron-Signature');
	const timestampStr = c.req.header('X-Agentuity-Cron-Timestamp');

	// If no signature headers, reject the request
	if (!signature || !timestampStr) {
		return false;
	}

	// Verify timestamp is within acceptable range (prevent replay attacks)
	const timestamp = parseInt(timestampStr, 10);
	const now = Math.floor(Date.now() / 1000);
	if (isNaN(timestamp) || Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_SECONDS) {
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
	const message = `${timestamp}.${body}`;
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

/**
 * Creates a cron middleware for scheduled task endpoints.
 *
 * **Important:** Cron endpoints must use POST method. The middleware will throw
 * an error if called with any other HTTP method.
 *
 * @example
 * ```typescript
 * import { createRouter, cron } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * // With authentication (recommended)
 * router.post('/daily-cleanup', cron('0 0 * * *', { auth: true }, (c) => {
 *   c.var.logger.info('Running daily cleanup');
 *   return { status: 'cleanup complete' };
 * }));
 *
 * // Without authentication (not recommended for production)
 * router.post('/health-check', cron('0 * * * *', { auth: false }, (c) => {
 *   c.var.logger.info('Running hourly health check');
 *   return c.text('OK');
 * }));
 * ```
 *
 * @param schedule - Cron expression (e.g., '0 0 * * *' for daily at midnight)
 * @param options - Configuration options including auth requirement
 * @param handler - Handler function to run on schedule
 * @returns Hono handler for cron endpoint
 */
export function cron<E extends Env = Env>(
	schedule: string,
	options: CronOptions,
	handler: CronHandler<E>
): Handler<E>;

/**
 * Creates a cron middleware for scheduled task endpoints.
 *
 * @deprecated Use the overload with explicit `options` parameter: `cron(schedule, { auth: true }, handler)`
 *
 * **Important:** Cron endpoints must use POST method. The middleware will throw
 * an error if called with any other HTTP method.
 *
 * This deprecated overload defaults to `auth: false` for backwards compatibility.
 *
 * @param schedule - Cron expression (e.g., '0 0 * * *' for daily at midnight)
 * @param handler - Handler function to run on schedule
 * @returns Hono handler for cron endpoint
 */
export function cron<E extends Env = Env>(schedule: string, handler: CronHandler<E>): Handler<E>;

export function cron<E extends Env = Env>(
	schedule: string,
	optionsOrHandler: CronOptions | CronHandler<E>,
	maybeHandler?: CronHandler<E>
): Handler<E> {
	let options: CronOptions;
	let handler: CronHandler<E>;

	if (typeof optionsOrHandler === 'function') {
		// Deprecated: cron(schedule, handler) - defaults to auth: false
		options = { auth: false };
		handler = optionsOrHandler;
	} else {
		// New: cron(schedule, options, handler)
		options = optionsOrHandler;
		handler = maybeHandler!;
	}

	return async (c: Context<E>) => {
		if (c.req.method !== 'POST') {
			throw new Error(
				`Cron endpoint must use POST method, but received ${c.req.method}. ` +
					`Use router.post() instead of router.${c.req.method.toLowerCase()}().`
			);
		}

		if (options.auth) {
			// Clone the request to read body for signature verification without consuming it
			const clonedReq = c.req.raw.clone();
			const body = await clonedReq.text();

			// Verify the cron signature
			const isValid = await verifyCronSignature(c, body);
			if (!isValid) {
				return c.json({ error: 'Unauthorized' }, 401);
			}
		}

		let result = handler(c);
		if (result instanceof Promise) {
			result = await result;
		}

		if (result instanceof Response) {
			return result;
		}

		return returnResponse(c, result);
	};
}

/**
 * Metadata interface for cron jobs (can be used for registration/discovery).
 */
export interface CronMetadata {
	schedule: string;
	path: string;
}
