export {
	AgentuityContext,
	AgentuityProvider,
	useAgentuity,
	useAuth,
	type ContextProviderArgs,
	type AgentuityContextValue,
	type AgentuityHookValue,
	type AuthContextValue,
} from './context';
export {
	createClient,
	createAPIClient,
	setGlobalBaseUrl,
	getGlobalBaseUrl,
	setGlobalAuthHeader,
	getGlobalAuthHeader,
	type RPCRouteRegistry,
} from './client';
export {
	useWebsocket,
	type WebSocketRouteKey,
	type WebSocketRouteInput,
	type WebSocketRouteOutput,
	type WebsocketOptions,
} from './websocket';
export {
	useEventStream,
	type SSERouteKey,
	type SSERouteOutput,
	type EventStreamOptions,
} from './eventstream';
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
} from './api';
export { useJsonMemo } from './memo';

// Analytics
export {
	useAnalytics,
	useTrackOnMount,
	withPageTracking,
	type UseAnalyticsResult,
	type TrackOnMountOptions,
} from './analytics.js';

// Re-export route registry types from local types file
// These are augmented by generated code via `declare module '@agentuity/react'`
export type { RouteRegistry, WebSocketRouteRegistry, SSERouteRegistry } from './types';

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
	// Client type exports (createClient is exported from ./client.ts)
	type Client,
	type ClientOptions,
	type RouteEndpoint,
	type WebSocketClient,
	type EventStreamClient,
	type StreamClient,
	type EventHandler,
} from '@agentuity/frontend';
