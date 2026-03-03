export {
	AgentuityContext,
	AgentuityProvider,
	useAgentuity,
	useAuth,
	type ContextProviderArgs,
	type AgentuityContextValue,
	type AgentuityHookValue,
	type AuthContextValue,
} from './context.tsx';
export {
	createClient,
	createAPIClient,
	setGlobalBaseUrl,
	getGlobalBaseUrl,
	setGlobalAuthHeader,
	getGlobalAuthHeader,
} from './client.ts';
export {
	useWebsocket,
	type WebSocketRouteKey,
	type WebSocketRouteInput,
	type WebSocketRouteOutput,
	type WebsocketOptions,
} from './websocket.ts';
export {
	useEventStream,
	type SSERouteKey,
	type SSERouteOutput,
	type EventStreamOptions,
} from './eventstream.ts';
export {
	useWebRTCCall,
	type UseWebRTCCallOptions,
	type UseWebRTCCallResult,
	type WebRTCConnectionState,
	type WebRTCClientCallbacks,
} from './webrtc.tsx';
export {
	useAPI,
	type RouteKey,
	type ExtractMethod,
	type RouteIsStream,
	type RouteInput,
	type RouteOutput,
	type RoutePathParams,
	type UseAPIOptions,
	type UseAPIResult,
	type InvokeOptions,
} from './api.ts';
export { useJsonMemo } from './memo.ts';

// Analytics
export {
	useAnalytics,
	useTrackOnMount,
	withPageTracking,
	type UseAnalyticsResult,
	type TrackOnMountOptions,
} from './analytics.tsx';

// Re-export route registry types from @agentuity/frontend
// These are augmented by generated code via `declare module '@agentuity/frontend'`
// Re-exporting ensures backwards compatibility for existing imports
export type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
} from '@agentuity/frontend';

// Re-export web utilities for convenience (excluding registry types which come from ./types)
export {
	buildUrl,
	defaultBaseUrl,
	deserializeData,
	createReconnectManager,
	jsonEqual,
	getProcessEnv,
	WebSocketManager,
	EventStreamManager,
	type ReconnectOptions,
	type ReconnectManager,
	type WebSocketMessageHandler,
	type WebSocketCallbacks,
	type WebSocketManagerOptions,
	type WebSocketManagerState,
	type EventStreamMessageHandler,
	type EventStreamCallbacks,
	type EventStreamManagerOptions,
	type EventStreamManagerState,
	WebRTCManager,
	UserMediaSource,
	DisplayMediaSource,
	CustomStreamSource,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	type WebRTCDisconnectReason,
	// Client type exports (createClient is exported from ./client.ts)
	type Client,
	type ClientOptions,
	type RouteEndpoint,
	type WebSocketClient,
	type EventStreamClient,
	type StreamClient,
	type EventHandler,
} from '@agentuity/frontend';
