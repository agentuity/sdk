import type { Context, Handler } from 'hono';
import { returnResponse } from '../_util.ts';
import type { Env } from '../app.ts';
import { verifySignature } from '../signature.ts';

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
	_schedule: string,
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
			const isValid = await verifySignature(
				c.req.header('X-Agentuity-Cron-Signature'),
				c.req.header('X-Agentuity-Cron-Timestamp'),
				body
			);
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
