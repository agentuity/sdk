const VISITOR_ID_KEY = 'agentuity_visitor_id';
const OPT_OUT_KEY = 'agentuity_analytics_optout';

/**
 * Generate a random UUID v4
 */
function generateUUID(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Get or create the visitor ID from localStorage
 */
export function getVisitorId(): string {
	if (typeof localStorage === 'undefined') {
		return generateUUID();
	}

	let visitorId = localStorage.getItem(VISITOR_ID_KEY);
	if (!visitorId) {
		visitorId = `vid_${generateUUID()}`;
		try {
			localStorage.setItem(VISITOR_ID_KEY, visitorId);
		} catch {
			// localStorage might be full or disabled
		}
	}
	return visitorId;
}

/**
 * Check if user has opted out
 */
export function isOptedOut(): boolean {
	if (typeof localStorage === 'undefined') {
		return false;
	}
	return localStorage.getItem(OPT_OUT_KEY) === 'true';
}

/**
 * Set opt-out status
 */
export function setOptOut(optOut: boolean): void {
	if (typeof localStorage === 'undefined') {
		return;
	}
	try {
		if (optOut) {
			localStorage.setItem(OPT_OUT_KEY, 'true');
		} else {
			localStorage.removeItem(OPT_OUT_KEY);
		}
	} catch {
		// localStorage might be full or disabled
	}
}
