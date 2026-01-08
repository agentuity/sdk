/**
 * Standalone beacon script - this file is bundled and minified
 * to create the production analytics.js served at /_agentuity/webanalytics/analytics.js
 *
 * This is the single source of truth for the beacon logic.
 */

interface ScrollEvent {
	depth: number;
	timestamp: number;
}

interface AnalyticsCustomEvent {
	timestamp: number;
	name: string;
	data: string;
}

interface GeoLocation {
	country?: string;
	country_latitude?: string | number;
	country_longitude?: string | number;
	region?: string;
	region_latitude?: string | number;
	region_longitude?: string | number;
	city?: string;
	city_latitude?: string | number;
	city_longitude?: string | number;
	timezone?: string;
	latitude?: string | number;
	longitude?: string | number;
}

interface PageViewData {
	id: string;
	timestamp: number;
	timezone_offset: number;
	url: string;
	path: string;
	referrer: string;
	title: string;
	screen_width: number;
	screen_height: number;
	viewport_width: number;
	viewport_height: number;
	device_pixel_ratio: number;
	user_agent: string;
	language: string;
	scroll_depth: number;
	time_on_page: number;
	scroll_events: ScrollEvent[];
	custom_events: AnalyticsCustomEvent[];
	load_time?: number;
	dom_ready?: number;
	ttfb?: number;
	fcp?: number;
	lcp?: number;
	cls?: number;
	inp?: number;
	country?: string;
	country_latitude?: number;
	country_longitude?: number;
	region?: string;
	region_latitude?: number;
	region_longitude?: number;
	city?: string;
	city_latitude?: number;
	city_longitude?: number;
	timezone?: string;
	latitude?: number;
	longitude?: number;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	[key: string]: unknown;
}

interface AnalyticsConfig {
	enabled: boolean;
	orgId: string;
	projectId: string;
	isDevmode: boolean;
	trackClicks?: boolean;
	trackScroll?: boolean;
	trackWebVitals?: boolean;
	trackErrors?: boolean;
	trackSPANavigation?: boolean;
	sampleRate?: number;
}

interface SessionData {
	threadId?: string;
}

interface AgentuityWindow {
	__AGENTUITY_ANALYTICS__?: AnalyticsConfig;
	__AGENTUITY_SESSION__?: SessionData;
	agentuityAnalytics?: {
		track: (name: string, properties?: Record<string, unknown>) => void;
		identify: (userId: string, traits?: Record<string, unknown>) => void;
		flush: () => void;
	};
}

const COLLECT_ENDPOINT = '/_agentuity/webanalytics/collect';
const MAX_CUSTOM_EVENTS = 1000;

(function () {
	const w = window as Window & AgentuityWindow;
	const d = document;
	const configRaw = w.__AGENTUITY_ANALYTICS__;

	if (!configRaw || !configRaw.enabled) return;

	// Prevent duplicate initialization (e.g., from HMR)
	const initFlag = w as unknown as { __AGENTUITY_BEACON_INIT__?: boolean };
	if (configRaw.isDevmode) {
		console.debug(
			'[Agentuity Analytics] Script loaded, init flag:',
			initFlag.__AGENTUITY_BEACON_INIT__,
			'path:',
			location.pathname
		);
	}
	if (initFlag.__AGENTUITY_BEACON_INIT__) {
		if (configRaw.isDevmode) {
			console.debug('[Agentuity Analytics] Already initialized, skipping');
		}
		return;
	}
	initFlag.__AGENTUITY_BEACON_INIT__ = true;

	// Store in a non-nullable variable after the guard
	const c: AnalyticsConfig = configRaw;

	let geo: GeoLocation | null = null;
	let sent = false;
	let pageStart = Date.now();
	let userId = '';
	let userTraits: Record<string, string> = {};

	const pv: PageViewData = {
		id: '',
		timestamp: 0,
		timezone_offset: 0,
		url: '',
		path: '',
		referrer: '',
		title: '',
		screen_width: 0,
		screen_height: 0,
		viewport_width: 0,
		viewport_height: 0,
		device_pixel_ratio: 1,
		user_agent: '',
		language: '',
		scroll_depth: 0,
		time_on_page: 0,
		scroll_events: [],
		custom_events: [],
	};

	function generateId(): string {
		return crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	function getUTMParams(): Record<string, string> {
		const params = new URLSearchParams(location.search);
		const utm: Record<string, string> = {};
		['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
			const value = params.get(key);
			if (value) utm[key] = value;
		});
		return utm;
	}

	// Strip query string from URL to prevent sensitive data leakage
	function stripQueryString(url: string): string {
		if (!url) return '';
		try {
			const parsed = new URL(url);
			return parsed.origin + parsed.pathname;
		} catch {
			// If URL parsing fails, try simple string split
			return url.split('?')[0];
		}
	}

	// Full init - called on page load and SPA navigation
	function init(): void {
		pv.id = generateId();
		pv.timestamp = Date.now();
		pv.timezone_offset = new Date().getTimezoneOffset();
		pv.url = stripQueryString(location.href);
		pv.path = location.pathname;
		pv.referrer = stripQueryString(d.referrer);
		pv.title = d.title || '';
		pv.screen_width = screen.width || 0;
		pv.screen_height = screen.height || 0;
		pv.viewport_width = innerWidth || 0;
		pv.viewport_height = innerHeight || 0;
		pv.device_pixel_ratio = devicePixelRatio || 1;
		pv.user_agent = navigator.userAgent || '';
		pv.language = navigator.language || '';

		const utm = getUTMParams();
		for (const k in utm) {
			pv[k] = utm[k];
		}

		pv.scroll_events = [];
		pv.custom_events = [];
		pv.scroll_depth = 0;
		pv.fcp = 0;
		pv.lcp = 0;
		pv.cls = 0;
		pv.inp = 0;
		sent = false;
		pageStart = Date.now();

		if (typeof performance !== 'undefined' && performance.getEntriesByType) {
			const nav = performance.getEntriesByType('navigation')[0] as
				| PerformanceNavigationTiming
				| undefined;
			if (nav) {
				pv.load_time = Math.round(nav.loadEventEnd - nav.startTime);
				pv.dom_ready = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
				pv.ttfb = Math.round(nav.responseStart - nav.requestStart);
			}
		}

		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] Session started (full init):', pv.id);
		}
	}

	// Soft reset - called when user returns to page (keeps page-level metrics)
	function resetSession(): void {
		pv.id = generateId();
		pv.timestamp = Date.now();
		pv.scroll_events = [];
		pv.custom_events = [];
		pv.scroll_depth = 0;
		pv.time_on_page = 0;
		sent = false;
		pageStart = Date.now();

		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] Session started (soft reset):', pv.id);
		}
	}

	// Fetch geo data
	fetch('https://agentuity.sh/location')
		.then((r) => r.json())
		.then((g: GeoLocation) => {
			geo = g;
			try {
				sessionStorage.setItem('agentuity_geo', JSON.stringify(g));
			} catch {
				// Ignore
			}
		})
		.catch(() => {
			try {
				const cached = sessionStorage.getItem('agentuity_geo');
				if (cached) geo = JSON.parse(cached);
			} catch {
				// Ignore
			}
		});

	// Try to load cached geo immediately
	try {
		const cached = sessionStorage.getItem('agentuity_geo');
		if (cached) geo = JSON.parse(cached);
	} catch {
		// Ignore
	}

	function getSession(): SessionData | undefined {
		return w.__AGENTUITY_SESSION__;
	}

	function send(force = false): void {
		if (sent && !force) {
			if (c.isDevmode) {
				console.debug('[Agentuity Analytics] send() skipped - already sent');
			}
			return;
		}
		if (c.sampleRate !== undefined && c.sampleRate < 1 && Math.random() > c.sampleRate) return;

		sent = true;
		pv.time_on_page = Date.now() - pageStart;

		if (geo) {
			pv.country = geo.country || '';
			if (geo.country_latitude) pv.country_latitude = parseFloat(String(geo.country_latitude));
			if (geo.country_longitude)
				pv.country_longitude = parseFloat(String(geo.country_longitude));
			pv.region = geo.region || '';
			if (geo.region_latitude) pv.region_latitude = parseFloat(String(geo.region_latitude));
			if (geo.region_longitude) pv.region_longitude = parseFloat(String(geo.region_longitude));
			pv.city = geo.city || '';
			if (geo.city_latitude) pv.city_latitude = parseFloat(String(geo.city_latitude));
			if (geo.city_longitude) pv.city_longitude = parseFloat(String(geo.city_longitude));
			pv.timezone = geo.timezone || '';
			if (geo.latitude) pv.latitude = parseFloat(String(geo.latitude));
			if (geo.longitude) pv.longitude = parseFloat(String(geo.longitude));
		}

		if (pv.cls) {
			pv.cls = Math.round(pv.cls * 1000) / 1000;
		}

		const s = getSession();
		const vid = localStorage.getItem('agentuity_visitor_id') || 'vid_' + generateId();
		try {
			localStorage.setItem('agentuity_visitor_id', vid);
		} catch {
			// Ignore
		}

		const payload = {
			org_id: c.orgId,
			project_id: c.projectId,
			thread_id: s?.threadId || '',
			visitor_id: vid,
			user_id: userId,
			user_traits: userTraits,
			is_devmode: c.isDevmode,
			pageview: pv,
		};

		// Clear pending data since we're sending now
		try {
			sessionStorage.removeItem('agentuity_pending_pageview');
		} catch {
			// Storage may be unavailable
		}

		if (c.isDevmode) {
			console.debug('[Agentuity Analytics]', JSON.stringify(payload, null, 2));
			return;
		}

		const body = JSON.stringify(payload);
		if (navigator.sendBeacon) {
			navigator.sendBeacon(COLLECT_ENDPOINT, body);
		} else {
			fetch(COLLECT_ENDPOINT, {
				method: 'POST',
				body,
				keepalive: true,
			}).catch(() => {
				// Silent failure
			});
		}
	}

	// Send on page hide, reset session on page visible
	d.addEventListener('visibilitychange', () => {
		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] visibilitychange:', d.visibilityState, 'sent:', sent);
		}
		if (d.visibilityState === 'hidden') {
			send();
		} else if (d.visibilityState === 'visible') {
			// User returned to the page - start a new attention session
			// Keep page-level metrics (url, geo, vitals) but reset session-level metrics
			resetSession();
		}
	});
	w.addEventListener('pagehide', () => {
		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] pagehide event');
			try {
				sessionStorage.setItem('agentuity_last_event', `pagehide:${Date.now()}:${pv.path}`);
			} catch {
				// Storage may be unavailable
			}
		}
		send();
	});

	// Catch hard navigations (URL change, link click to new page, refresh)
	w.addEventListener('beforeunload', () => {
		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] beforeunload event');
			try {
				sessionStorage.setItem('agentuity_last_event', `beforeunload:${Date.now()}:${pv.path}`);
			} catch {
				// Storage may be unavailable
			}
		}
		send();
	});

	// In devmode, check if previous page sent data (helps verify unload events work)
	if (c.isDevmode) {
		try {
			const lastEvent = sessionStorage.getItem('agentuity_last_event');
			if (lastEvent) {
				console.debug('[Agentuity Analytics] Previous page event:', lastEvent);
				sessionStorage.removeItem('agentuity_last_event');
			}
		} catch {
			// Storage may be unavailable
		}
	}

	// Fallback: check for unsent data from previous page (in case unload events didn't fire)
	try {
		const pendingData = sessionStorage.getItem('agentuity_pending_pageview');
		if (pendingData) {
			sessionStorage.removeItem('agentuity_pending_pageview');
			const pending = JSON.parse(pendingData);
			// Only send if it's from a different page
			if (pending.pageview?.path !== location.pathname) {
				if (c.isDevmode) {
					console.debug(
						'[Agentuity Analytics] Sending unsent data from previous page:',
						pending.pageview?.path
					);
					console.debug('[Agentuity Analytics]', JSON.stringify(pending, null, 2));
				} else {
					const body = JSON.stringify(pending);
					if (navigator.sendBeacon) {
						navigator.sendBeacon(COLLECT_ENDPOINT, body);
					}
				}
			}
		}
	} catch {
		// Storage or JSON parsing may fail
	}

	// Store current pageview data periodically so it can be recovered if unload events don't fire
	function savePendingData(): void {
		try {
			pv.time_on_page = Date.now() - pageStart;
			const s = getSession();
			const vid = localStorage.getItem('agentuity_visitor_id') || 'vid_' + generateId();
			const payload = {
				org_id: c.orgId,
				project_id: c.projectId,
				thread_id: s?.threadId || '',
				visitor_id: vid,
				user_id: userId,
				user_traits: userTraits,
				is_devmode: c.isDevmode,
				pageview: { ...pv },
			};
			sessionStorage.setItem('agentuity_pending_pageview', JSON.stringify(payload));
		} catch {
			// Storage may be unavailable
		}
	}

	// Save pending data every 2 seconds
	setInterval(savePendingData, 2000);
	// Also save on any interaction
	d.addEventListener('click', savePendingData, { passive: true });
	d.addEventListener('scroll', savePendingData, { passive: true, once: true });

	if (c.isDevmode) {
		console.debug('[Agentuity Analytics] Beacon initialized, visibility:', d.visibilityState);
	}

	// Scroll tracking
	if (c.trackScroll !== false) {
		const scrolled = new Set<number>();

		function getScrollDepth(): number {
			const st = w.scrollY || d.documentElement.scrollTop;
			const sh = d.documentElement.scrollHeight - d.documentElement.clientHeight;
			return sh <= 0 ? 100 : Math.min(100, Math.round((st / sh) * 100));
		}

		w.addEventListener(
			'scroll',
			() => {
				const dp = getScrollDepth();
				if (dp > pv.scroll_depth) pv.scroll_depth = dp;

				[25, 50, 75, 100].forEach((m) => {
					if (dp >= m && !scrolled.has(m)) {
						scrolled.add(m);
						pv.scroll_events.push({
							depth: m,
							timestamp: Date.now() - pageStart,
						});
					}
				});
			},
			{ passive: true }
		);
	}

	// Web Vitals tracking
	if (c.trackWebVitals !== false && typeof PerformanceObserver !== 'undefined') {
		// FCP
		try {
			const fcpObs = new PerformanceObserver((list) => {
				list.getEntries().forEach((entry) => {
					if (entry.name === 'first-contentful-paint') {
						pv.fcp = Math.round(entry.startTime);
						fcpObs.disconnect();
					}
				});
			});
			fcpObs.observe({ type: 'paint', buffered: true });
		} catch {
			// Not supported
		}

		// LCP
		try {
			new PerformanceObserver((list) => {
				const entries = list.getEntries();
				if (entries.length) {
					pv.lcp = Math.round(entries[entries.length - 1].startTime);
				}
			}).observe({ type: 'largest-contentful-paint', buffered: true });
		} catch {
			// Not supported
		}

		// CLS
		try {
			new PerformanceObserver((list) => {
				list.getEntries().forEach((entry) => {
					const layoutShift = entry as PerformanceEntry & {
						hadRecentInput?: boolean;
						value?: number;
					};
					if (!layoutShift.hadRecentInput && layoutShift.value) {
						pv.cls = (pv.cls || 0) + layoutShift.value;
					}
				});
			}).observe({ type: 'layout-shift', buffered: true });
		} catch {
			// Not supported
		}

		// INP
		try {
			new PerformanceObserver((list) => {
				list.getEntries().forEach((entry) => {
					const eventEntry = entry as PerformanceEntry & { duration?: number };
					if (eventEntry.duration && eventEntry.duration > (pv.inp || 0)) {
						pv.inp = Math.round(eventEntry.duration);
					}
				});
			}).observe({ type: 'event', buffered: true });
		} catch {
			// Not supported
		}
	}

	// SPA navigation tracking
	if (c.trackSPANavigation !== false) {
		const origPush = history.pushState;
		const origReplace = history.replaceState;
		let currentPath = location.pathname + location.search;
		let lastHref = location.href;

		if (c.isDevmode) {
			console.debug('[Agentuity Analytics] SPA tracking enabled, initial path:', currentPath);
		}

		function handleNav(): void {
			const newPath = location.pathname + location.search;
			if (newPath !== currentPath) {
				if (c.isDevmode) {
					console.debug('[Agentuity Analytics] SPA navigation:', currentPath, '->', newPath);
				}
				send(true); // Force send on SPA navigation
				currentPath = newPath;
				lastHref = location.href;
				init();
			}
		}

		history.pushState = function (...args) {
			origPush.apply(this, args);
			setTimeout(handleNav, 0);
		};

		history.replaceState = function (...args) {
			origReplace.apply(this, args);
			setTimeout(handleNav, 0);
		};

		w.addEventListener('popstate', handleNav);

		// Fallback: poll for URL changes in case router bypasses history API
		setInterval(() => {
			if (location.href !== lastHref) {
				lastHref = location.href;
				handleNav();
			}
		}, 200);
	}

	// Click tracking
	if (c.trackClicks !== false) {
		d.addEventListener(
			'click',
			(e) => {
				const target = e.target as Element | null;
				if (!target) return;

				const analyticsEl = target.closest('[data-analytics]');
				if (!analyticsEl) return;

				if (pv.custom_events.length < MAX_CUSTOM_EVENTS) {
					pv.custom_events.push({
						timestamp: Date.now(),
						name: 'click:' + analyticsEl.getAttribute('data-analytics'),
						data: '',
					});
				}
			},
			true
		);
	}

	// Error tracking
	if (c.trackErrors !== false) {
		w.addEventListener('error', (e) => {
			if (pv.custom_events.length < MAX_CUSTOM_EVENTS) {
				pv.custom_events.push({
					timestamp: Date.now(),
					name: 'error:js_error',
					data: JSON.stringify({
						message: e.message || 'Unknown',
						filename: e.filename || '',
						lineno: e.lineno || 0,
					}),
				});
			}
		});

		w.addEventListener('unhandledrejection', (e) => {
			if (pv.custom_events.length < MAX_CUSTOM_EVENTS) {
				pv.custom_events.push({
					timestamp: Date.now(),
					name: 'error:unhandled_rejection',
					data: JSON.stringify({
						message: e.reason instanceof Error ? e.reason.message : String(e.reason),
					}),
				});
			}
		});
	}

	// Initialize on load
	if (d.readyState === 'complete') {
		init();
	} else {
		w.addEventListener('load', init);
	}

	// Public API
	w.agentuityAnalytics = {
		track(name: string, properties?: Record<string, unknown>): void {
			if (pv.custom_events.length < MAX_CUSTOM_EVENTS) {
				pv.custom_events.push({
					timestamp: Date.now(),
					name,
					data: properties ? JSON.stringify(properties) : '',
				});
			}
		},
		identify(id: string, traits?: Record<string, unknown>): void {
			userId = id;
			if (traits) {
				userTraits = {};
				for (const [key, value] of Object.entries(traits)) {
					userTraits[key] = String(value);
				}
			}
		},
		flush: () => send(true),
	};
})();
