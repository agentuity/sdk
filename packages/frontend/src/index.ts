export { getProcessEnv } from './env.ts';
export { buildUrl, defaultBaseUrl } from './url.ts';
export { deserializeData } from './serialization.ts';
export { createReconnectManager, type ReconnectOptions, type ReconnectManager } from './reconnect.ts';
export type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
} from './types.ts';
export { jsonEqual } from './memo.ts';
export {
	WebSocketManager,
	type MessageHandler as WebSocketMessageHandler,
	type WebSocketCallbacks,
	type WebSocketManagerOptions,
	type WebSocketManagerState,
} from './websocket-manager.ts';
export {
	EventStreamManager,
	type MessageHandler as EventStreamMessageHandler,
	type EventStreamCallbacks,
	type EventStreamManagerOptions,
	type EventStreamManagerState,
} from './eventstream-manager.ts';
export {
	WebRTCManager,
	UserMediaSource,
	DisplayMediaSource,
	CustomStreamSource,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	type WebRTCClientCallbacks,
	type TrackSource,
} from './webrtc-manager.ts';

// Re-export core WebRTC types for convenience
export type {
	WebRTCConnectionState,
	WebRTCDisconnectReason,
	DataChannelConfig,
	DataChannelMessage,
	DataChannelState,
	ConnectionQualitySummary,
	RecordingOptions,
	RecordingHandle,
	RecordingState,
} from '@agentuity/core';

// Export client implementation (local to this package)
export { createClient } from './client/index.ts';
export type {
	Client,
	ClientOptions,
	RouteEndpoint,
	WebSocketClient,
	EventStreamClient,
	StreamClient,
	EventHandler,
} from './client/types.ts';

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
	type AnalyticsCustomEvent,
	type GeoLocation,
} from './analytics/index.ts';

// Re-export beacon script for server-side use
// The actual value is replaced at build time by scripts/build-beacon.ts
export { BEACON_SCRIPT, validateBeaconScript } from './beacon-script.ts';
