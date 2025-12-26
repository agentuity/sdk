import type { Context, Handler } from 'hono';
import { returnResponse } from '../_util';
import type { Env } from '../app';

/**
 * Handler function for cron jobs.
 * Receives the Hono context and can return any response.
 */
export type CronHandler<E extends Env = Env> = (c: Context<E>) => unknown | Promise<unknown>;

/**
 * Creates a cron middleware for scheduled task endpoints.
 *
 * **Important:** Cron endpoints must use POST method. The middleware will throw
 * an error if called with any other HTTP method.
 *
 * Use with router.post() to create a cron endpoint:
 *
 * @example
 * ```typescript
 * import { createRouter, cron } from '@agentuity/runtime';
 *
 * const router = createRouter();
 *
 * // Daily cleanup at midnight
 * router.post('/daily-cleanup', cron('0 0 * * *', (c) => {
 *   c.var.logger.info('Running daily cleanup');
 *   return { status: 'cleanup complete' };
 * }));
 *
 * // Hourly health check
 * router.post('/health-check', cron('0 * * * *', (c) => {
 *   c.var.logger.info('Running hourly health check');
 *   return c.text('OK');
 * }));
 * ```
 *
 * @param schedule - Cron expression (e.g., '0 0 * * *' for daily at midnight)
 * @param handler - Handler function to run on schedule
 * @returns Hono handler for cron endpoint
 */
export function cron<E extends Env = Env>(schedule: string, handler: CronHandler<E>): Handler<E> {
	return async (c: Context<E>) => {
		if (c.req.method !== 'POST') {
			throw new Error(
				`Cron endpoint must use POST method, but received ${c.req.method}. ` +
					`Use router.post() instead of router.${c.req.method.toLowerCase()}().`
			);
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
