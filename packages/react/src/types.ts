/**
 * Route Registry Types for @agentuity/react
 *
 * These interfaces are re-exported from @agentuity/frontend and augmented by
 * generated code (src/generated/routes.ts) to provide type-safe routing for
 * useAPI, useWebsocket, useEventStream, and createAPIClient.
 *
 * @remarks
 * The generated code uses `declare module '@agentuity/frontend'` to augment
 * these interfaces. Since @agentuity/react re-exports them, the augmented
 * types are available when importing from either package.
 *
 * This design ensures that in monorepo setups with multiple node_modules,
 * TypeScript sees consistent types as long as @agentuity/frontend is properly
 * resolved (via hoisting or tsconfig paths).
 */

export type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
} from '@agentuity/frontend';
