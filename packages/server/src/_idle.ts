import { getServer } from './_server';

let pendingWaitUntilCounter = 0;

export function startPendingWaitUntil() {
	pendingWaitUntilCounter++;
}

export function endPendingWaitUntil() {
	pendingWaitUntilCounter--;
}

export function hasPendingWaitUntil() {
	return pendingWaitUntilCounter > 0;
}

/**
 * returns true if the server is idle (no pending requests, websockets, or waitUntil tasks)
 *
 * @returns true if idle
 */
export function isIdle() {
	if (hasPendingWaitUntil()) {
		return false;
	}

	const _server = getServer();
	if (_server) {
		if (_server.pendingRequests > 0) {
			return false;
		}
		if (_server.pendingWebSockets > 0) {
			return false;
		}
	}

	return true;
}
