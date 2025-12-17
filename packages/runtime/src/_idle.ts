import { hasWaitUntilPending } from './_waituntil';

/**
 * returns true if the server is idle (no pending waitUntil tasks)
 *
 * @returns true if idle
 */
export function isIdle() {
	return !hasWaitUntilPending();
}
