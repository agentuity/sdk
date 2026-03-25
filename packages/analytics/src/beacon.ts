/**
 * Analytics beacon - auto-initializing script
 *
 * Import this module to automatically start tracking:
 * ```typescript
 * import '@agentuity/analytics/beacon';
 * ```
 *
 * Requires window.__AGENTUITY_ANALYTICS__ to be set by server.
 */

import { isEnabled, getConfig, isDevmode } from './config';
import {
	initClient,
	updatePageView,
	resetSession,
	send,
	track,
	setupGlobal,
	getPageView,
} from './client';
import { generateId, stripQueryString, getUTMParams, fetchGeo } from './util';
import type { PageViewData } from './types';

// Track if already initialized
let initialized = false;

/**
 * Initialize page view data
 */
function initPageView(): PageViewData {
	const pv: PageViewData = {
		id: generateId(),
		timestamp: Date.now(),
		timezone_offset: new Date().getTimezoneOffset(),
		url: stripQueryString(location.href),
		path: location.pathname,
		referrer: stripQueryString(document.referrer),
		title: document.title || '',
		screen_width: screen.width || 0,
		screen_height: screen.height || 0,
		viewport_width: innerWidth || 0,
		viewport_height: innerHeight || 0,
		device_pixel_ratio: devicePixelRatio || 1,
		user_agent: navigator.userAgent || '',
		language: navigator.language || '',
		scroll_depth: 0,
		time_on_page: 0,
		scroll_events: [],
		custom_events: [],
	};

	// Add UTM params
	const utm = getUTMParams();
	for (const k in utm) {
		pv[k] = utm[k];
	}

	// Capture navigation timing
	if (typeof performance !== 'undefined' && performance.getEntriesByType) {
		const nav = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined;
		if (nav) {
			pv.dom_ready = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
			pv.ttfb = Math.round(nav.responseStart - nav.requestStart);
			if (nav.loadEventEnd > 0) {
				pv.load_time = Math.round(nav.loadEventEnd - nav.startTime);
			} else {
				// Defer reading loadEventEnd
				setTimeout(() => {
					const navAfter = performance.getEntriesByType('navigation')[0] as
						| PerformanceNavigationTiming
						| undefined;
					if (navAfter && navAfter.loadEventEnd > 0) {
						updatePageView({
							load_time: Math.round(navAfter.loadEventEnd - navAfter.startTime),
						});
					}
				}, 0);
			}
		}
	}

	return pv;
}

/**
 * Set up visibility change handlers
 */
function setupVisibilityHandlers(): void {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			send();
		} else if (document.visibilityState === 'visible') {
			// User returned - start new attention session
			resetSession();
		}
	});

	window.addEventListener('pagehide', () => send());
	window.addEventListener('beforeunload', () => send());
}

/**
 * Set up scroll tracking
 */
function setupScrollTracking(): void {
	const config = getConfig();
	if (config?.trackScroll === false) return;

	const scrolled = new Set<number>();

	function getScrollDepth(): number {
		const st = window.scrollY || document.documentElement.scrollTop;
		const sh = document.documentElement.scrollHeight - document.documentElement.clientHeight;
		return sh <= 0 ? 100 : Math.min(100, Math.round((st / sh) * 100));
	}

	window.addEventListener(
		'scroll',
		() => {
			const depth = getScrollDepth();
			updatePageView({ scroll_depth: depth });

			for (const m of [25, 50, 75, 100]) {
				if (depth >= m && !scrolled.has(m)) {
					scrolled.add(m);
					const pv = getPageView();
					if (pv) {
						pv.scroll_events.push({
							depth: m,
							timestamp: Date.now(),
						});
					}
				}
			}
		},
		{ passive: true }
	);
}

/**
 * Set up Web Vitals tracking
 */
function setupWebVitals(): void {
	const config = getConfig();
	if (config?.trackWebVitals === false) return;
	if (typeof PerformanceObserver === 'undefined') return;

	// FCP
	try {
		const fcpObs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') {
					updatePageView({ fcp: Math.round(entry.startTime) });
					fcpObs.disconnect();
				}
			}
		});
		fcpObs.observe({ type: 'paint', buffered: true });
	} catch {
		/* Not supported */
	}

	// LCP
	try {
		new PerformanceObserver((list) => {
			const entries = list.getEntries();
			const last = entries[entries.length - 1];
			if (last) {
				updatePageView({ lcp: Math.round(last.startTime) });
			}
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	} catch {
		/* Not supported */
	}

	// CLS
	try {
		let clsValue = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
				if (!shift.hadRecentInput && shift.value) {
					clsValue += shift.value;
				}
			}
			updatePageView({ cls: Math.round(clsValue * 1000) / 1000 });
		}).observe({ type: 'layout-shift', buffered: true });
	} catch {
		/* Not supported */
	}

	// INP
	try {
		let inpValue = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const event = entry as PerformanceEntry & { duration?: number };
				if (event.duration && event.duration > inpValue) {
					inpValue = event.duration;
				}
			}
			updatePageView({ inp: Math.round(inpValue) });
		}).observe({ type: 'event', buffered: true });
	} catch {
		/* Not supported */
	}
}

/**
 * Set up SPA navigation tracking
 */
function setupSPANavigation(): void {
	const config = getConfig();
	if (config?.trackSPANavigation === false) return;

	let currentPath = location.pathname + location.search;
	let lastHref = location.href;

	function handleNav(): void {
		const newPath = location.pathname + location.search;
		if (newPath !== currentPath) {
			send(true); // Force send on SPA nav
			currentPath = newPath;
			lastHref = location.href;
			initClient(initPageView());
		}
	}

	// Monkey-patch history
	const origPush = history.pushState;
	const origReplace = history.replaceState;

	history.pushState = function (...args: [data: unknown, unused: string, url?: string | URL]) {
		origPush.apply(this, args);
		setTimeout(handleNav, 0);
	};

	history.replaceState = function (...args: [data: unknown, unused: string, url?: string | URL]) {
		origReplace.apply(this, args);
		setTimeout(handleNav, 0);
	};

	window.addEventListener('popstate', handleNav);

	// Fallback: poll for URL changes
	setInterval(() => {
		if (location.href !== lastHref) {
			lastHref = location.href;
			handleNav();
		}
	}, 200);
}

/**
 * Set up click tracking
 */
function setupClickTracking(): void {
	const config = getConfig();
	if (config?.trackClicks === false) return;

	document.addEventListener(
		'click',
		(e) => {
			const target = e.target as Element | null;
			if (!target) return;

			const el = target.closest('[data-analytics]');
			if (!el) return;

			const name = 'click:' + el.getAttribute('data-analytics');
			track(name);
		},
		true
	);
}

/**
 * Set up error tracking
 */
function setupErrorTracking(): void {
	const config = getConfig();
	if (config?.trackErrors === false) return;

	window.addEventListener('error', (e) => {
		track('error:js_error', {
			message: e.message || 'Unknown',
			filename: e.filename || '',
			lineno: e.lineno || 0,
		});
	});

	window.addEventListener('unhandledrejection', (e) => {
		track('error:unhandled_rejection', {
			message: e.reason instanceof Error ? e.reason.message : String(e.reason),
		});
	});
}

/**
 * Initialize the beacon
 */
function init(): void {
	if (initialized) return;
	if (!isEnabled()) return;

	initialized = true;

	// Init page view
	const pv = initPageView();
	initClient(pv);

	// Fetch geo (async)
	fetchGeo();

	// Set up all tracking
	setupVisibilityHandlers();
	setupScrollTracking();
	setupWebVitals();
	setupSPANavigation();
	setupClickTracking();
	setupErrorTracking();

	// Set up global API
	setupGlobal();

	// Init on load if not ready
	if (document.readyState === 'complete') {
		// Already loaded
	} else {
		window.addEventListener('load', () => {
			// Re-capture timing after load
			updatePageView(initPageView());
		});
	}

	if (isDevmode()) {
		console.debug('[Agentuity Analytics] Beacon initialized');
	}
}

// Auto-initialize on import
init();
