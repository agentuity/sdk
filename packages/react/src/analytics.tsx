import React, { useCallback, useEffect, useRef } from 'react';
import { getAnalytics, type AnalyticsClient } from '@agentuity/frontend';

/**
 * Result of the useAnalytics hook
 */
export interface UseAnalyticsResult {
	/**
	 * Track a custom event
	 */
	track: (eventName: string, properties?: Record<string, unknown>) => void;

	/**
	 * Get a click handler that tracks an event
	 */
	trackClick: (
		eventName: string,
		properties?: Record<string, unknown>
	) => (event: React.MouseEvent) => void;

	/**
	 * Whether analytics is enabled
	 */
	enabled: boolean;

	/**
	 * Flush pending events
	 */
	flush: () => Promise<void>;

	/**
	 * Opt out of analytics
	 */
	optOut: () => void;

	/**
	 * Opt in to analytics
	 */
	optIn: () => void;
}

/**
 * Hook for tracking analytics events in React components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { track, trackClick } = useAnalytics();
 *
 *   useEffect(() => {
 *     track('component_viewed', { name: 'MyComponent' });
 *   }, [track]);
 *
 *   return (
 *     <button onClick={trackClick('button_clicked', { button: 'submit' })}>
 *       Submit
 *     </button>
 *   );
 * }
 * ```
 */
export function useAnalytics(): UseAnalyticsResult {
	const clientRef = useRef<AnalyticsClient | null>(null);

	// Get client on first render
	if (!clientRef.current) {
		clientRef.current = getAnalytics();
	}

	const client = clientRef.current;

	const track = useCallback(
		(eventName: string, properties?: Record<string, unknown>) => {
			client.track(eventName, properties);
		},
		[client]
	);

	const trackClick = useCallback(
		(eventName: string, properties?: Record<string, unknown>) => {
			return (_event: React.MouseEvent) => {
				client.track(eventName, properties);
			};
		},
		[client]
	);

	const flush = useCallback(() => {
		return client.flush();
	}, [client]);

	const optOut = useCallback(() => {
		client.optOut();
	}, [client]);

	const optIn = useCallback(() => {
		client.optIn();
	}, [client]);

	return {
		track,
		trackClick,
		enabled: client.isEnabled(),
		flush,
		optOut,
		optIn,
	};
}

/**
 * Options for useTrackOnMount
 */
export interface TrackOnMountOptions {
	/**
	 * Event name to track
	 */
	eventName: string;

	/**
	 * Event properties
	 */
	properties?: Record<string, unknown>;

	/**
	 * Only track once (default: true)
	 */
	once?: boolean;
}

/**
 * Hook to track an event when a component mounts
 *
 * @example
 * ```tsx
 * function ProductPage({ productId }: { productId: string }) {
 *   useTrackOnMount({
 *     eventName: 'product_viewed',
 *     properties: { productId }
 *   });
 *
 *   return <div>Product {productId}</div>;
 * }
 * ```
 */
export function useTrackOnMount(options: TrackOnMountOptions): void {
	const { eventName, properties, once = true } = options;
	const trackedRef = useRef(false);
	const { track } = useAnalytics();

	useEffect(() => {
		if (once && trackedRef.current) {
			return;
		}

		track(eventName, properties);
		trackedRef.current = true;
	}, [eventName, once, properties, track]);
}

/**
 * Higher-order component for tracking page views
 *
 * @example
 * ```tsx
 * const TrackedHomePage = withPageTracking(HomePage, 'home');
 * ```
 */
export function withPageTracking<P extends object>(
	Component: React.ComponentType<P>,
	pageName?: string
): React.ComponentType<P> {
	const displayName = Component.displayName || Component.name || 'Component';

	function TrackedComponent(props: P) {
		useTrackOnMount({
			eventName: 'page_view',
			properties: {
				page: pageName || displayName,
			},
		});

		return <Component {...props} />;
	}

	TrackedComponent.displayName = `withPageTracking(${displayName})`;

	return TrackedComponent;
}
