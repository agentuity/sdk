import { createBaseEvent } from './pageview';
import { queueEvent, flushEvents } from '../events';

/**
 * Initialize Core Web Vitals tracking
 * Uses PerformanceObserver to track LCP, FCP, CLS, INP
 */
export function initWebVitalsTracking(): void {
	if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
		return;
	}

	// Track First Contentful Paint (FCP)
	try {
		const fcpObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') {
					const event = createBaseEvent('web_vital');
					event.event_name = 'fcp';
					event.fcp = Math.round(entry.startTime);
					queueEvent(event);
					flushEvents();
					fcpObserver.disconnect();
				}
			}
		});
		fcpObserver.observe({ type: 'paint', buffered: true });
	} catch {
		// PerformanceObserver not supported for this entry type
	}

	// Track Largest Contentful Paint (LCP)
	try {
		let lcpValue = 0;
		const lcpObserver = new PerformanceObserver((list) => {
			const entries = list.getEntries();
			const lastEntry = entries[entries.length - 1];
			if (lastEntry) {
				lcpValue = lastEntry.startTime;
			}
		});
		lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

		// Report LCP when page becomes hidden
		document.addEventListener(
			'visibilitychange',
			() => {
				if (document.visibilityState === 'hidden' && lcpValue > 0) {
					const event = createBaseEvent('web_vital');
					event.event_name = 'lcp';
					event.lcp = Math.round(lcpValue);
					queueEvent(event);
					flushEvents();
					lcpObserver.disconnect();
				}
			},
			{ once: true }
		);
	} catch {
		// PerformanceObserver not supported for this entry type
	}

	// Track Cumulative Layout Shift (CLS)
	try {
		let clsValue = 0;
		const clsObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const layoutShift = entry as PerformanceEntry & {
					hadRecentInput?: boolean;
					value?: number;
				};
				if (!layoutShift.hadRecentInput && layoutShift.value) {
					clsValue += layoutShift.value;
				}
			}
		});
		clsObserver.observe({ type: 'layout-shift', buffered: true });

		// Report CLS when page becomes hidden
		document.addEventListener(
			'visibilitychange',
			() => {
				if (document.visibilityState === 'hidden') {
					const event = createBaseEvent('web_vital');
					event.event_name = 'cls';
					event.cls = Math.round(clsValue * 1000) / 1000; // Round to 3 decimal places
					queueEvent(event);
					flushEvents();
					clsObserver.disconnect();
				}
			},
			{ once: true }
		);
	} catch {
		// PerformanceObserver not supported for this entry type
	}

	// Track Interaction to Next Paint (INP)
	try {
		let inpValue = 0;
		const inpObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const eventEntry = entry as PerformanceEntry & { duration?: number };
				if (eventEntry.duration && eventEntry.duration > inpValue) {
					inpValue = eventEntry.duration;
				}
			}
		});
		inpObserver.observe({ type: 'event', buffered: true });

		// Report INP when page becomes hidden
		document.addEventListener(
			'visibilitychange',
			() => {
				if (document.visibilityState === 'hidden' && inpValue > 0) {
					const event = createBaseEvent('web_vital');
					event.event_name = 'inp';
					event.inp = Math.round(inpValue);
					queueEvent(event);
					flushEvents();
					inpObserver.disconnect();
				}
			},
			{ once: true }
		);
	} catch {
		// PerformanceObserver not supported for this entry type
	}
}
