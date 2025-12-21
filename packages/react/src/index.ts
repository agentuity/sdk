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
	useWebRTCCall,
	type UseWebRTCCallOptions,
	type UseWebRTCCallResult,
	type WebRTCStatus,
} from './webrtc';
export {
	useAPI,
	type RouteKey,
	type ExtractMethod,
	type RouteIsStream,
	type RouteInput,
	type RouteOutput,
	type UseAPIOptions,
	type UseAPIResult,
} from './api';
export { useJsonMemo } from './memo';

// Re-export web utilities for convenience
export {
	buildUrl,
	defaultBaseUrl,
	deserializeData,
	createReconnectManager,
	jsonEqual,
	getProcessEnv,
	WebSocketManager,
	EventStreamManager,
	type RouteRegistry,
	type WebSocketRouteRegistry,
	type SSERouteRegistry,
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
	type WebRTCCallbacks,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	// Client type exports (createClient is exported from ./client.ts)
	type Client,
	type ClientOptions,
	type RouteEndpoint,
	type WebSocketClient,
	type EventStreamClient,
	type StreamClient,
	type EventHandler,
} from '@agentuity/frontend';
