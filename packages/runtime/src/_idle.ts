import { hasWaitUntilPending } from './_waituntil';

/**
 * returns true if the server is idle (no pending requests, websockets, or waitUntil tasks)
 *
 * In Vite-native mode, we only check for pending waitUntil tasks.
 *
 * @returns true if idle
 */
export function isIdle() {
	return !hasWaitUntilPending();
}
