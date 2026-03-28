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
 * import { AgentuityProvider } from '@agentuity/react/client';
 * ```
 *
 * @remarks
 * For type-safe API calls, use Hono's `hc()` client directly:
 * ```typescript
 * import { hc } from 'hono/client';
 * import type router from './src/api/router';
 * const client = hc<typeof router>('http://localhost:3000');
 * ```
 */

// Re-export everything from server (utilities)
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
} from '@agentuity/frontend';
