import type { AnalyticsEvent } from '../types';
import { queueEvent } from '../events';
import { getUTMParams } from '../utils/utm';

/**
 * Create a base event with common properties
 */
export function createBaseEvent(eventType: AnalyticsEvent['event_type']): AnalyticsEvent {
	const utm = getUTMParams();

	return {
		id: crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		timestamp: Date.now(),
		timezone_offset: new Date().getTimezoneOffset(),

		event_type: eventType,

		url: window.location.href,
		path: window.location.pathname,
		referrer: document.referrer || '',
		title: document.title || '',

		screen_width: window.screen?.width || 0,
		screen_height: window.screen?.height || 0,
		viewport_width: window.innerWidth || 0,
		viewport_height: window.innerHeight || 0,
		device_pixel_ratio: window.devicePixelRatio || 1,
		user_agent: navigator.userAgent || '',
		language: navigator.language || '',

		...utm,
	};
}

/**
 * Track a pageview event
 */
export function trackPageview(customPath?: string): void {
	const event = createBaseEvent('pageview');

	if (customPath) {
		event.path = customPath;
		event.url = window.location.origin + customPath;
	}

	// Add performance timing if available
	if (typeof performance !== 'undefined') {
		const timing = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined;
		if (timing) {
			event.load_time = Math.round(timing.loadEventEnd - timing.startTime);
			event.dom_ready = Math.round(timing.domContentLoadedEventEnd - timing.startTime);
			event.ttfb = Math.round(timing.responseStart - timing.requestStart);
		}
	}

	queueEvent(event);
}

/**
 * Initialize pageview tracking
 * Tracks initial pageview when called
 */
export function initPageviewTracking(): void {
	// Track initial pageview after DOM is ready
	if (document.readyState === 'complete') {
		trackPageview();
	} else {
		window.addEventListener('load', () => {
			trackPageview();
		});
	}
}
