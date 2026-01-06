import type { AnalyticsEvent, AnalyticsBatchPayload, AnalyticsPageConfig } from './types';
import { getVisitorId } from './utils/storage';

const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 5000;
const COLLECT_ENDPOINT = '/_agentuity/webanalytics/collect';

let eventQueue: AnalyticsEvent[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let config: AnalyticsPageConfig | null = null;

/**
 * Initialize the event queue with config
 */
export function initEventQueue(pageConfig: AnalyticsPageConfig): void {
	config = pageConfig;

	// Flush on page unload
	if (typeof window !== 'undefined') {
		window.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				flushEvents();
			}
		});

		window.addEventListener('pagehide', () => {
			flushEvents();
		});
	}
}

/**
 * Queue an event for sending
 */
export function queueEvent(event: AnalyticsEvent): void {
	if (!config) {
		return;
	}

	// Apply sample rate (default: 1 = 100%)
	const sampleRate = config.sampleRate ?? 1;
	if (sampleRate < 1 && Math.random() > sampleRate) {
		return;
	}

	// Check exclude patterns
	const excludePatterns = config.excludePatterns ?? [];
	if (excludePatterns.length > 0) {
		const currentPath = window.location.pathname;
		for (const pattern of excludePatterns) {
			try {
				if (new RegExp(pattern).test(currentPath)) {
					return;
				}
			} catch {
				// Invalid regex, skip
			}
		}
	}

	// Add global properties to event data
	if (config.globalProperties && Object.keys(config.globalProperties).length > 0) {
		event.event_data = {
			...config.globalProperties,
			...event.event_data,
		};
	}

	eventQueue.push(event);

	// Flush if batch size reached
	if (eventQueue.length >= BATCH_SIZE) {
		flushEvents();
	} else if (!batchTimeout) {
		// Set timeout for batch flush
		batchTimeout = setTimeout(() => {
			flushEvents();
		}, BATCH_TIMEOUT_MS);
	}
}

/**
 * Flush all queued events
 */
export function flushEvents(): void {
	if (batchTimeout) {
		clearTimeout(batchTimeout);
		batchTimeout = null;
	}

	if (eventQueue.length === 0 || !config) {
		return;
	}

	const events = eventQueue;
	eventQueue = [];

	// In dev mode, log to console instead of sending
	if (config.isDevmode) {
		console.debug('[Agentuity Analytics] Events:', events);
		return;
	}

	const payload: AnalyticsBatchPayload = {
		org_id: config.orgId,
		project_id: config.projectId,
		session_id: config.sessionId,
		thread_id: config.threadId,
		visitor_id: getVisitorId(),
		is_devmode: config.isDevmode,
		events,
	};

	const body = JSON.stringify(payload);

	// Use sendBeacon for reliable delivery
	if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
		const sent = navigator.sendBeacon(COLLECT_ENDPOINT, body);
		if (sent) {
			return;
		}
	}

	// Fallback to fetch with keepalive
	if (typeof fetch !== 'undefined') {
		fetch(COLLECT_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body,
			keepalive: true,
		}).catch(() => {
			// Silent failure - analytics is best effort
		});
	}
}

/**
 * Get current queue length (for testing)
 */
export function getQueueLength(): number {
	return eventQueue.length;
}
