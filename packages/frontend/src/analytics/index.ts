/**
 * Web Analytics for Agentuity SDK applications
 *
 * This module provides client-side analytics tracking for web applications
 * built with the Agentuity SDK.
 */

export { getAnalytics, track, initBeacon } from './beacon';

export type {
	AnalyticsClient,
	AnalyticsEvent,
	AnalyticsEventType,
	AnalyticsBatchPayload,
	AnalyticsPageConfig,
} from './types';

// Re-export utilities for advanced usage
export { trackPageview, createBaseEvent } from './collectors/pageview';
export { getVisitorId, isOptedOut, setOptOut } from './utils/storage';
export { getUTMParams } from './utils/utm';
