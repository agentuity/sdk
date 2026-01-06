/**
 * Analytics event types
 */
export type AnalyticsEventType =
	| 'pageview'
	| 'click'
	| 'scroll'
	| 'visibility'
	| 'error'
	| 'custom'
	| 'web_vital'
	| 'form_submit'
	| 'outbound_link';

/**
 * Analytics event sent to the collection endpoint
 */
export interface AnalyticsEvent {
	id: string;
	timestamp: number;
	timezone_offset: number;

	event_type: AnalyticsEventType;
	event_name?: string;
	event_data?: Record<string, unknown>;

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

	load_time?: number;
	dom_ready?: number;
	ttfb?: number;
	fcp?: number;
	lcp?: number;
	cls?: number;
	inp?: number;

	scroll_depth?: number;
	time_on_page?: number;

	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
}

/**
 * Batch payload sent to /_agentuity/webanalytics/collect
 */
export interface AnalyticsBatchPayload {
	org_id: string;
	project_id: string;
	session_id: string;
	thread_id: string;
	visitor_id: string;
	is_devmode: boolean;
	events: AnalyticsEvent[];
}

/**
 * Configuration injected by SDK runtime into window.__AGENTUITY_ANALYTICS__
 */
export interface AnalyticsPageConfig {
	enabled: boolean;
	orgId: string;
	projectId: string;
	sessionId: string;
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
 * Public analytics client interface
 */
export interface AnalyticsClient {
	/**
	 * Track a custom event
	 */
	track(eventName: string, properties?: Record<string, unknown>): void;

	/**
	 * Identify the current user (sets visitor properties)
	 */
	identify(userId: string, traits?: Record<string, unknown>): void;

	/**
	 * Manually track a page view
	 */
	pageview(path?: string): void;

	/**
	 * Flush pending events immediately
	 */
	flush(): Promise<void>;

	/**
	 * Opt out of analytics
	 */
	optOut(): void;

	/**
	 * Opt back in to analytics
	 */
	optIn(): void;

	/**
	 * Check if analytics is currently enabled
	 */
	isEnabled(): boolean;
}

declare global {
	interface Window {
		__AGENTUITY_ANALYTICS__?: AnalyticsPageConfig;
	}
}
