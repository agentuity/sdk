import { getServer } from './_server';
import { hasWaitUntilPending } from './_waituntil';

/**
 * returns true if the server is idle (no pending requests, websockets, or waitUntil tasks)
 *
 * @returns true if idle
 */
export function isIdle() {
	if (hasWaitUntilPending()) {
		return false;
	}

	const _server = getServer();
	if (_server) {
		// we have to check >1 since the idle request itself will show up as a pending request
		if (_server.pendingRequests > 1) {
			return false;
		}
		if (_server.pendingWebSockets > 0) {
			return false;
		}
	}

	return true;
}
