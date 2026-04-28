/**
 * Async-timer helpers.
 *
 * Direct replacement for `Bun.sleep(ms)` using Node's native
 * `node:timers/promises`, available identically on Bun.
 */

import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

/** Resolve after `ms` milliseconds. Replacement for `Bun.sleep(ms)`. */
export function sleep(ms: number): Promise<void> {
	return setTimeoutPromise(ms);
}
