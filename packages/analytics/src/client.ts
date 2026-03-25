/**
 * Analytics client - programmatic API
 */

import { isEnabled, getConfig, getEndpoint, getSession } from './config';
import { generateId, safeStringify, getVisitorId } from './util';
import type { AnalyticsClient, PageViewData, AnalyticsPayload } from './types';

/** Pending custom events */
let customEvents: Array<{ timestamp: number; name: string; data: string }> = [];

/** Current user ID */
let userId = '';

/** Current user traits */
let userTraits: Record<string, string> = {};

/** Current page view data */
let pageView: PageViewData | null = null;

/** Whether current page view was sent */
let sent = false;

/** Page view start time */
let pageStart = Date.now();

/**
 * Initialize client with page view data
 * Called by beacon or can be called manually
 */
export function initClient(pv: PageViewData): void {
	pageView = pv;
	customEvents = [];
	sent = false;
	pageStart = Date.now();
}

/**
 * Update page view data
 */
export function updatePageView(updates: Partial<PageViewData>): void {
	if (pageView) {
		Object.assign(pageView, updates);
	}
}

/**
 * Get current page view data
 */
export function getPageView(): PageViewData | null {
	return pageView;
}

/**
 * Reset session (keep page-level metrics, reset session metrics)
 */
export function resetSession(): void {
	if (pageView) {
		pageView.id = generateId();
		pageView.timestamp = Date.now();
		pageView.scroll_events = [];
		pageView.custom_events = customEvents;
		pageView.scroll_depth = 0;
		pageView.time_on_page = 0;
	}
	sent = false;
	pageStart = Date.now();
}

/**
 * Build payload for sending
 */
function buildPayload(): AnalyticsPayload | null {
	if (!pageView) return null;

	const config = getConfig();
	if (!config) return null;

	const session = getSession();

	return {
		org_id: config.orgId,
		project_id: config.projectId,
		thread_id: session?.threadId ?? '',
		visitor_id: getVisitorId(),
		user_id: userId,
		user_traits: userTraits,
		is_devmode: config.isDevmode ?? false,
		pageview: {
			...pageView,
			custom_events: customEvents,
			time_on_page: Date.now() - pageStart,
		},
	};
}

/**
 * Send analytics data
 */
export function send(force = false): void {
	if (sent && !force) return;
	if (!isEnabled()) return;

	const config = getConfig();
	if (!config) return;

	// Check sample rate
	if (config.sampleRate !== undefined && config.sampleRate < 1) {
		if (Math.random() > config.sampleRate) return;
	}

	sent = true;

	const payload = buildPayload();
	if (!payload) return;

	// Dev mode: just log
	if (config.isDevmode) {
		console.debug('[Agentuity Analytics]', JSON.stringify(payload, null, 2));
		return;
	}

	// Production: send to endpoint
	const body = JSON.stringify(payload);
	const endpoint = getEndpoint();

	if (navigator.sendBeacon) {
		navigator.sendBeacon(endpoint, body);
	} else {
		fetch(endpoint, {
			method: 'POST',
			body,
			keepalive: true,
		}).catch(() => {
			// Silent failure
		});
	}
}

/**
 * Track a custom event
 */
export function track(name: string, properties?: Record<string, unknown>): void {
	if (!isEnabled()) return;
	if (customEvents.length >= 1000) return;

	customEvents.push({
		timestamp: Date.now(),
		name,
		data: safeStringify(properties),
	});
}

/**
 * Identify a user
 */
export function identify(id: string, traits?: Record<string, unknown>): void {
	userId = id;
	if (traits) {
		userTraits = {};
		for (const [key, value] of Object.entries(traits)) {
			userTraits[key] = String(value);
		}
	}
}

/**
 * Flush pending events
 */
export function flush(): void {
	send(true);
}

/**
 * Get the analytics client
 */
export function getClient(): AnalyticsClient {
	return {
		track,
		identify,
		flush,
	};
}

/**
 * Set up client as window.global
 */
export function setupGlobal(): void {
	if (typeof window !== 'undefined') {
		window.agentuityAnalytics = getClient();
	}
}
