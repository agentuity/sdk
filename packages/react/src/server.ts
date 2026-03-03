/**
 * Server-safe exports for @agentuity/react
 *
 * This entrypoint provides utilities that are safe to use in server-side contexts
 * (SSR, server components, API routes, loaders, etc.). It does NOT include React
 * hooks, which require a browser environment.
 *
 * @example
 * ```typescript
 * // In a server loader (TanStack Start, Remix, Next.js server component)
 * import { createClient, type RPCRouteRegistry } from '@agentuity/react/server';
 *
 * const client = createClient<AppRPCRouteRegistry>();
 * const data = await client.users.get();
 * ```
 *
 * @remarks
 * For client-side React components that need hooks like useAPI, useWebsocket, etc.,
 * import from '@agentuity/react/client' instead.
 */

// Client creation utilities
export {
	createClient,
	createAPIClient,
	setGlobalBaseUrl,
	getGlobalBaseUrl,
	setGlobalAuthHeader,
	getGlobalAuthHeader,
} from './client';

// Re-export all registry types from @agentuity/frontend
export type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
} from '@agentuity/frontend';

// Re-export useful utilities from @agentuity/frontend
export {
	buildUrl,
	defaultBaseUrl,
	deserializeData,
	jsonEqual,
	getProcessEnv,
	type Client,
	type ClientOptions,
	type RouteEndpoint,
} from '@agentuity/frontend';

// Re-export type utilities for route inference
export type {
	RouteKey,
	ExtractMethod,
	RouteIsStream,
	RouteInput,
	RouteOutput,
	RoutePathParams,
} from './api';

export type { WebSocketRouteKey, WebSocketRouteInput, WebSocketRouteOutput } from './websocket';

export type { SSERouteKey, SSERouteOutput } from './eventstream';
