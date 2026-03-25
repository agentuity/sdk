/**
 * @agentuity/analytics - Browser analytics for Agentuity applications
 *
 * ## Usage
 *
 * ### Auto-init (drop-in)
 * ```typescript
 * // Just import - uses window.__AGENTUITY_ANALYTICS__ config
 * import '@agentuity/analytics/beacon';
 * ```
 *
 * ### Programmatic
 * ```typescript
 * import { init, track, identify, flush } from '@agentuity/analytics';
 *
 * init({
 *   orgId: 'your-org-id',
 *   projectId: 'your-project-id',
 * });
 *
 * track('button_click', { button: 'signup' });
 * identify('user-123', { email: 'user@example.com' });
 * flush();
 * ```
 *
 * ### With React
 * ```typescript
 * import { useEffect } from 'react';
 * import { track } from '@agentuity/analytics';
 *
 * function SignupButton() {
 *   const handleClick = () => {
 *     track('signup_click');
 *   };
 *   return <button onClick={handleClick}>Sign Up</button>;
 * }
 * ```
 */

// Types
export type {
	AnalyticsConfig,
	AnalyticsClient,
	AnalyticsPayload,
	PageViewData,
	ScrollEvent,
	AnalyticsCustomEvent,
	GeoLocation,
	SessionData,
} from './types';

// Config utilities
export {
	getConfig,
	isEnabled,
	isDevmode,
	getEndpoint,
	DEFAULT_ENDPOINT,
} from './config';

// Utility functions
export {
	generateId,
	getVisitorId,
	getUTMParams,
	stripQueryString,
} from './util';

// Programmatic API
export {
	initClient,
	track,
	identify,
	flush,
	send,
	getClient,
} from './client';

/**
 * Initialize analytics with explicit config
 * Alternative to using window.__AGENTUITY_ANALYTICS__
 */
export function init(config: import('./types').AnalyticsConfig): void {
	if (typeof window !== 'undefined') {
		window.__AGENTUITY_ANALYTICS__ = config;
		// Import beacon to trigger auto-init
		import('./beacon');
	}
}

/**
 * Get the global analytics client
 */
export function getAnalytics(): import('./types').AnalyticsClient | null {
	if (typeof window !== 'undefined' && window.agentuityAnalytics) {
		return window.agentuityAnalytics;
	}
	return null;
}
