/**
 * Web Analytics for Agentuity SDK applications
 *
 * The analytics beacon is bundled separately via beacon-standalone.ts
 * and injected as a script tag by the SDK runtime.
 *
 * This module re-exports types and utilities for programmatic access.
 */

import type { AnalyticsClient } from './types.ts';

export type {
	AnalyticsClient,
	AnalyticsPayload,
	AnalyticsPageConfig,
	PageViewPayload,
	ScrollEvent,
	AnalyticsCustomEvent,
	GeoLocation,
} from './types.ts';

export { getVisitorId, isOptedOut, setOptOut } from './utils/storage.ts';
export { getUTMParams } from './utils/utm.ts';

/**
 * Get the analytics client from the global window object.
 * Returns null if the beacon hasn't been initialized.
 */
export function getAnalytics(): AnalyticsClient | null {
	if (typeof window !== 'undefined') {
		const client = (window as { agentuityAnalytics?: AnalyticsClient }).agentuityAnalytics;
		return client ?? null;
	}
	return null;
}

/**
 * Track a custom event. No-op if analytics isn't initialized.
 */
export function track(eventName: string, properties?: Record<string, unknown>): void {
	getAnalytics()?.track(eventName, properties);
}
