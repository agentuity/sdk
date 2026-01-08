export { getProcessEnv } from './env';
export { buildUrl, defaultBaseUrl } from './url';
export { deserializeData } from './serialization';
export { createReconnectManager, type ReconnectOptions, type ReconnectManager } from './reconnect';
export { type RouteRegistry, type WebSocketRouteRegistry, type SSERouteRegistry } from './types';
export { jsonEqual } from './memo';
export {
	WebSocketManager,
	type MessageHandler as WebSocketMessageHandler,
	type WebSocketCallbacks,
	type WebSocketManagerOptions,
	type WebSocketManagerState,
} from './websocket-manager';
export {
	EventStreamManager,
	type MessageHandler as EventStreamMessageHandler,
	type EventStreamCallbacks,
	type EventStreamManagerOptions,
	type EventStreamManagerState,
} from './eventstream-manager';

// Export client implementation (local to this package)
export { createClient } from './client/index';
export type {
	Client,
	ClientOptions,
	RouteEndpoint,
	WebSocketClient,
	EventStreamClient,
	StreamClient,
	EventHandler,
} from './client/types';

// Export analytics (beacon is bundled separately via beacon-standalone.ts)
export {
	getAnalytics,
	track,
	getVisitorId,
	isOptedOut,
	setOptOut,
	getUTMParams,
	type AnalyticsClient,
	type AnalyticsPayload,
	type AnalyticsPageConfig,
	type PageViewPayload,
	type ScrollEvent,
	type CustomEvent,
	type GeoLocation,
} from './analytics';

// Re-export beacon script for server-side use
// The actual value is replaced at build time by scripts/build-beacon.ts
export { BEACON_SCRIPT, validateBeaconScript } from './beacon-script';
