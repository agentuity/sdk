/**
 * Analytics type definitions
 */

/** Scroll depth milestone event */
export interface ScrollEvent {
	depth: number;
	timestamp: number;
}

/** Custom analytics event */
export interface AnalyticsCustomEvent {
	timestamp: number;
	name: string;
	data: string;
}

/** Geo location data from IP */
export interface GeoLocation {
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

/** Page view data collected by the beacon */
export interface PageViewData {
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

/** Analytics configuration */
export interface AnalyticsConfig {
	/** Enable/disable tracking */
	enabled: boolean;
	/** Organization ID */
	orgId: string;
	/** Project ID */
	projectId: string;
	/** Running in development mode */
	isDevmode?: boolean;
	/** Track clicks on [data-analytics] elements */
	trackClicks?: boolean;
	/** Track scroll depth */
	trackScroll?: boolean;
	/** Track Web Vitals (FCP, LCP, CLS, INP) */
	trackWebVitals?: boolean;
	/** Track JS errors */
	trackErrors?: boolean;
	/** Track SPA navigation */
	trackSPANavigation?: boolean;
	/** Sampling rate (0-1) */
	sampleRate?: number;
	/** Custom collect endpoint */
	endpoint?: string;
}

/** Session data from server */
export interface SessionData {
	threadId?: string;
}

/** Analytics client API */
export interface AnalyticsClient {
	/** Track a custom event */
	track: (name: string, properties?: Record<string, unknown>) => void;
	/** Identify a user */
	identify: (userId: string, traits?: Record<string, unknown>) => void;
	/** Flush pending events */
	flush: () => void;
}

/** Payload sent to collect endpoint */
export interface AnalyticsPayload {
	org_id: string;
	project_id: string;
	thread_id: string;
	visitor_id: string;
	user_id: string;
	user_traits: Record<string, string>;
	is_devmode: boolean;
	pageview: PageViewData;
}
