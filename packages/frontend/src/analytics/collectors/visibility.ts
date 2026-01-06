import { createBaseEvent } from './pageview';
import { queueEvent } from '../events';
import { getMaxScrollDepth } from './scroll';

let pageEntryTime = 0;
let hiddenTime = 0;
let lastHiddenTimestamp = 0;
let visibilityTrackingInitialized = false;
let visibilityChangeHandler: (() => void) | null = null;

/**
 * Get total time spent on page (excluding hidden time)
 */
function getTimeOnPage(): number {
	if (pageEntryTime === 0) {
		return 0;
	}

	const totalTime = Date.now() - pageEntryTime;
	return Math.max(0, totalTime - hiddenTime);
}

/**
 * Initialize visibility tracking
 * Tracks when user leaves/returns to the page
 */
export function initVisibilityTracking(): void {
	if (typeof document === 'undefined') {
		return;
	}

	if (visibilityTrackingInitialized) {
		return;
	}
	visibilityTrackingInitialized = true;

	pageEntryTime = Date.now();
	hiddenTime = 0;
	lastHiddenTimestamp = 0;

	visibilityChangeHandler = () => {
		if (document.visibilityState === 'hidden') {
			lastHiddenTimestamp = Date.now();

			// Track page leave with engagement metrics
			const event = createBaseEvent('visibility');
			event.event_name = 'page_hidden';
			event.time_on_page = getTimeOnPage();
			event.scroll_depth = getMaxScrollDepth();

			queueEvent(event);
		} else if (document.visibilityState === 'visible') {
			// Calculate hidden duration
			if (lastHiddenTimestamp > 0) {
				hiddenTime += Date.now() - lastHiddenTimestamp;
				lastHiddenTimestamp = 0;
			}

			const event = createBaseEvent('visibility');
			event.event_name = 'page_visible';

			queueEvent(event);
		}
	};

	document.addEventListener('visibilitychange', visibilityChangeHandler);
}

/**
 * Remove visibility tracking listener
 */
export function removeVisibilityTracking(): void {
	if (visibilityChangeHandler) {
		document.removeEventListener('visibilitychange', visibilityChangeHandler);
		visibilityChangeHandler = null;
	}
	visibilityTrackingInitialized = false;
}

/**
 * Reset visibility tracking (for SPA navigation)
 */
export function resetVisibilityTracking(): void {
	pageEntryTime = Date.now();
	hiddenTime = 0;
	lastHiddenTimestamp = 0;
}

/**
 * Get current time on page
 */
export function getCurrentTimeOnPage(): number {
	return getTimeOnPage();
}
