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
export {
	WebRTCManager,
	type WebRTCStatus,
	type WebRTCCallbacks,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	type WebRTCClientCallbacks,
} from './webrtc-manager';

// Re-export core WebRTC types for convenience
export type { WebRTCConnectionState, WebRTCDisconnectReason } from '@agentuity/core';

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
