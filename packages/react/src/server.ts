/**
 * Server-safe exports for @agentuity/react
 *
 * This entrypoint provides utilities that are safe to use in server-side contexts
 * (SSR, server components, API routes, loaders, etc.). It does NOT include React
 * hooks, which require a browser environment.
 *
 * For type-safe API calls, use Hono's `hc()` client directly:
 *
 * @example
 * ```typescript
 * import { hc } from 'hono/client';
 * import type router from './src/api/router';
 *
 * const client = hc<typeof router>('http://localhost:3000');
 * ```
 */

// Re-export useful utilities from @agentuity/frontend
export {
	buildUrl,
	defaultBaseUrl,
	deserializeData,
	jsonEqual,
	getProcessEnv,
} from '@agentuity/frontend';
