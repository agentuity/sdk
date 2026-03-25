/**
 * Web Analytics for Agentuity SDK applications
 *
 * @deprecated Import directly from '@agentuity/analytics' instead.
 * This module re-exports for backwards compatibility.
 */

// Re-export everything from @agentuity/analytics
export {
	getAnalytics,
	track,
	flush,
	identify,
	getVisitorId,
	getUTMParams,
	isEnabled,
	type AnalyticsClient,
	type AnalyticsPayload,
	type PageViewData,
	type ScrollEvent,
	type AnalyticsCustomEvent,
	type GeoLocation,
	type SessionData,
	type AnalyticsConfig,
} from '@agentuity/analytics';

// Legacy type aliases
export type { PageViewData as PageViewPayload } from '@agentuity/analytics';

/**
 * Check if user has opted out
 * @deprecated Use your own opt-out mechanism
 */
export function isOptedOut(): boolean {
	try {
		return localStorage.getItem('agentuity_opt_out') === 'true';
	} catch {
		return false;
	}
}

/**
 * Set opt-out status
 * @deprecated Use your own opt-out mechanism
 */
export function setOptOut(optOut: boolean): void {
	try {
		localStorage.setItem('agentuity_opt_out', String(optOut));
	} catch {
		// localStorage not available
	}
}
