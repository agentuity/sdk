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

// Export analytics
export {
	getAnalytics,
	track,
	initBeacon,
	trackPageview,
	createBaseEvent,
	getVisitorId,
	isOptedOut,
	setOptOut,
	getUTMParams,
	type AnalyticsClient,
	type AnalyticsEvent,
	type AnalyticsEventType,
	type AnalyticsBatchPayload,
	type AnalyticsPageConfig,
} from './analytics';
