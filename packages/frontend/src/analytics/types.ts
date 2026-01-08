/**
 * Scroll milestone event - records when a scroll depth milestone was first crossed
 */
export interface ScrollEvent {
	depth: number; // 25, 50, 75, or 100
	timestamp: number; // ms since page load
}

/**
 * Custom event tracked during the page session
 */
export interface CustomEvent {
	timestamp: number; // ms since epoch
	name: string;
	data?: string; // JSON string
}

/**
 * Geo location data from agentuity.sh/location
 */
export interface GeoLocation {
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
}

/**
 * Page view payload sent to the collection endpoint
 * Represents a single page view with all aggregated data
 */
export interface PageViewPayload {
	id: string;
	timestamp: number;
	timezone_offset: number;

	// Page context
	url: string;
	path: string;
	referrer: string;
	title: string;

	// Device/browser
	screen_width: number;
	screen_height: number;
	viewport_width: number;
	viewport_height: number;
	device_pixel_ratio: number;
	user_agent: string;
	language: string;

	// Geography
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

	// Performance metrics
	load_time?: number;
	dom_ready?: number;
	ttfb?: number;

	// Web vitals (collected during session)
	fcp?: number;
	lcp?: number;
	cls?: number;
	inp?: number;

	// Engagement metrics
	scroll_depth: number; // max scroll depth reached
	time_on_page: number; // ms

	// Scroll events: when milestones were first crossed
	scroll_events: ScrollEvent[];

	// Custom events (max 1000)
	custom_events: CustomEvent[];

	// UTM parameters
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
}

/**
 * Payload sent to /_agentuity/webanalytics/collect
 */
export interface AnalyticsPayload {
	org_id: string;
	project_id: string;
	thread_id: string;
	visitor_id: string;
	user_id: string;
	user_traits: Record<string, string>;
	is_devmode: boolean;
	pageview: PageViewPayload;
}

/**
 * Configuration injected by SDK runtime into window.__AGENTUITY_ANALYTICS__
 */
export interface AnalyticsPageConfig {
	enabled: boolean;
	orgId: string;
	projectId: string;
	threadId: string;
	isDevmode: boolean;

	trackClicks?: boolean;
	trackScroll?: boolean;
	trackOutboundLinks?: boolean;
	trackForms?: boolean;
	trackWebVitals?: boolean;
	trackErrors?: boolean;
	trackSPANavigation?: boolean;
	requireConsent?: boolean;
	sampleRate?: number;
	excludePatterns?: string[];
	globalProperties?: Record<string, unknown>;
}

/**
 * Public analytics client interface (exposed on window.agentuityAnalytics)
 */
export interface AnalyticsClient {
	/**
	 * Track a custom event (aggregated and sent on page exit)
	 */
	track(eventName: string, properties?: Record<string, unknown>): void;

	/**
	 * Identify the current user
	 */
	identify(userId: string, traits?: Record<string, unknown>): void;

	/**
	 * Flush pending page view data immediately
	 */
	flush(): void;
}

declare global {
	interface Window {
		__AGENTUITY_ANALYTICS__?: AnalyticsPageConfig;
		__AGENTUITY_SESSION__?: {
			threadId?: string;
		};
		agentuityAnalytics?: AnalyticsClient;
	}
}
