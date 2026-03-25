/**
 * Analytics configuration resolution
 */

import type { AnalyticsConfig } from './types';

/** Window with Agentuity analytics globals */
declare global {
	interface Window {
		__AGENTUITY_ANALYTICS__?: AnalyticsConfig;
		agentuityAnalytics?: import('./types').AnalyticsClient;
	}
}

/** Default collect endpoint */
export const DEFAULT_ENDPOINT = '/_agentuity/webanalytics/collect';

/** Maximum custom events per page view */
export const MAX_CUSTOM_EVENTS = 1000;

/**
 * Get analytics config from window global
 */
export function getConfig(): AnalyticsConfig | null {
	return window.__AGENTUITY_ANALYTICS__ ?? null;
}

/**
 * Check if analytics is enabled
 */
export function isEnabled(): boolean {
	const config = getConfig();
	return config?.enabled === true;
}

/**
 * Check if running in dev mode
 */
export function isDevmode(): boolean {
	return getConfig()?.isDevmode ?? false;
}

/**
 * Get the collect endpoint
 */
export function getEndpoint(): string {
	return getConfig()?.endpoint ?? DEFAULT_ENDPOINT;
}
