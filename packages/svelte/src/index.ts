export { initAgentuity, setAuthHeader, setBaseUrl, type AgentuityContextValue } from './context';

export {
	createClient,
	createAPIClient,
	setGlobalBaseUrl,
	getGlobalBaseUrl,
	setGlobalAuthHeader,
	getGlobalAuthHeader,
} from './client';

// Re-export route registry types from @agentuity/frontend
// These are augmented by generated code via `declare module '@agentuity/frontend'`
// Re-exporting ensures backwards compatibility for existing imports
export type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
} from '@agentuity/frontend';

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
