import type { AnalyticsPageConfig, AnalyticsClient } from './types';
import { initEventQueue, queueEvent, flushEvents } from './events';
import { initPageviewTracking, createBaseEvent, trackPageview } from './collectors/pageview';
import { initSPATracking } from './collectors/spa';
import { initClickTracking, initOutboundLinkTracking } from './collectors/clicks';
import { initScrollTracking } from './collectors/scroll';
import { initErrorTracking } from './collectors/errors';
import { initVisibilityTracking } from './collectors/visibility';
import { initFormTracking } from './collectors/forms';
import { initWebVitalsTracking } from './collectors/webvitals';
import { isOptedOut, setOptOut } from './utils/storage';
import { initOfflineSupport, getAndClearOfflineEvents } from './offline';

let initialized = false;
let trackingStarted = false;
let analyticsEnabled = true;
let consentRequired = false;
let consentGiven = false;

/**
 * Check if analytics should run
 */
function shouldTrack(): boolean {
	if (!analyticsEnabled) return false;
	if (isOptedOut()) return false;
	if (consentRequired && !consentGiven) return false;
	return true;
}

/**
 * Initialize the analytics beacon
 * Called automatically when the script loads
 */
export function initBeacon(): void {
	if (initialized) {
		return;
	}

	const config = window.__AGENTUITY_ANALYTICS__;
	if (!config || !config.enabled) {
		analyticsEnabled = false;
		return;
	}

	initialized = true;
	consentRequired = config.requireConsent ?? false;

	// If consent is required and not given, wait for optIn
	if (consentRequired && !consentGiven) {
		return;
	}

	startTracking(config);
}

/**
 * Start all tracking based on config
 */
function startTracking(config: AnalyticsPageConfig): void {
	if (trackingStarted) {
		return;
	}
	trackingStarted = true;

	// Initialize event queue
	initEventQueue(config);

	// Initialize offline support
	initOfflineSupport(async () => {
		// Flush offline events when coming back online
		const offlineEvents = await getAndClearOfflineEvents();
		for (const event of offlineEvents) {
			queueEvent(event);
		}
		flushEvents();
	});

	// Always track pageviews
	initPageviewTracking();

	// Initialize visibility tracking (for time on page)
	initVisibilityTracking();

	// Conditional tracking based on config (all default to true except requireConsent)
	if (config.trackSPANavigation !== false) {
		initSPATracking();
	}

	if (config.trackClicks !== false) {
		initClickTracking();
	}

	if (config.trackOutboundLinks !== false) {
		initOutboundLinkTracking();
	}

	if (config.trackScroll !== false) {
		initScrollTracking();
	}

	if (config.trackErrors !== false) {
		initErrorTracking();
	}

	if (config.trackForms !== false) {
		initFormTracking();
	}

	if (config.trackWebVitals !== false) {
		initWebVitalsTracking();
	}
}

/**
 * Create the analytics client API
 */
function createClient(): AnalyticsClient {
	return {
		track(eventName: string, properties?: Record<string, unknown>): void {
			if (!shouldTrack()) return;

			const event = createBaseEvent('custom');
			event.event_name = eventName;
			if (properties) {
				event.event_data = properties;
			}
			queueEvent(event);
		},

		identify(userId: string, traits?: Record<string, unknown>): void {
			if (!shouldTrack()) return;

			const event = createBaseEvent('custom');
			event.event_name = 'identify';
			event.event_data = {
				user_id: userId,
				...traits,
			};
			queueEvent(event);
		},

		pageview(path?: string): void {
			if (!shouldTrack()) return;
			trackPageview(path);
		},

		async flush(): Promise<void> {
			flushEvents();
		},

		optOut(): void {
			setOptOut(true);
			analyticsEnabled = false;
		},

		optIn(): void {
			setOptOut(false);
			analyticsEnabled = true;
			consentGiven = true;

			// If consent was required and now given, start tracking
			if (consentRequired && !trackingStarted) {
				const config = window.__AGENTUITY_ANALYTICS__;
				if (config) {
					startTracking(config);
				}
			}
		},

		isEnabled(): boolean {
			return shouldTrack();
		},
	};
}

// Singleton client instance
let clientInstance: AnalyticsClient | null = null;

/**
 * Get the analytics client instance
 */
export function getAnalytics(): AnalyticsClient {
	if (!clientInstance) {
		clientInstance = createClient();
	}
	return clientInstance;
}

/**
 * Convenience function to track a custom event
 */
export function track(eventName: string, properties?: Record<string, unknown>): void {
	getAnalytics().track(eventName, properties);
}

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initBeacon);
	} else {
		initBeacon();
	}
}
