'use client';

/**
 * Client-only exports for @agentuity/react
 *
 * This entrypoint provides React hooks and components that require a browser
 * environment. It includes the 'use client' directive for React Server Components
 * compatibility.
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * import { useAPI, AgentuityProvider } from '@agentuity/react/client';
 *
 * export function MyComponent() {
 *   const { data } = useAPI({ route: 'GET /users' });
 *   return <div>{JSON.stringify(data)}</div>;
 * }
 * ```
 *
 * @remarks
 * For server-side code that needs createClient without hooks, import from
 * '@agentuity/react/server' instead.
 */

// Re-export everything from server (types, createClient, utilities)
export * from './server';

// Context and Provider
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

// API hook
export { useAPI, type UseAPIOptions, type UseAPIResult } from './api';

// WebSocket hook
export { useWebsocket, type WebsocketOptions } from './websocket';

// EventStream hook
export { useEventStream, type EventStreamOptions } from './eventstream';

// JSON memo hook
export { useJsonMemo } from './memo';

// Analytics hooks
export {
	useAnalytics,
	useTrackOnMount,
	withPageTracking,
	type UseAnalyticsResult,
	type TrackOnMountOptions,
} from './analytics';

// Re-export additional web utilities from @agentuity/frontend
export {
	createReconnectManager,
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
	type WebSocketClient,
	type EventStreamClient,
	type StreamClient,
	type EventHandler,
} from '@agentuity/frontend';
