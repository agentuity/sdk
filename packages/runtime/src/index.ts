/**
 * @agentuity/runtime — DEPRECATED
 *
 * This package is no longer maintained. Agentuity v3 uses a framework-agnostic
 * architecture where you bring your own framework (Next.js, Hono, Astro, etc.)
 * and integrate Agentuity services via the @agentuity/hono middleware or
 * individual service client packages.
 *
 * Migration guide:
 *
 *   1. Pick a framework: Next.js, Hono, SvelteKit, Remix, Astro, etc.
 *   2. Replace createApp() with your framework's app setup
 *   3. Use @agentuity/hono middleware for service injection (kv, vector, queue, etc.)
 *   4. Use @agentuity/cli for build and deploy (agentuity build / agentuity deploy)
 *
 * Example (Hono):
 *
 *   import { Hono } from 'hono';
 *   import { agentuity } from '@agentuity/hono';
 *
 *   const app = new Hono();
 *   app.use('*', agentuity());
 *
 *   app.get('/data', async (c) => {
 *     const data = await c.var.kv.get('ns', 'key');
 *     return c.json(data);
 *   });
 *
 *   export default app;
 *
 * See https://agentuity.dev/docs/migration for the full migration guide.
 */

const appMessage =
	'@agentuity/runtime is deprecated. ' +
	'Use a dedicated framework (Hono, Next.js, etc.) with @agentuity/hono middleware instead. ' +
	'See https://agentuity.dev/docs/migration';

const agentMessage =
	'createAgent() is deprecated. ' +
	'Use an AI SDK (OpenAI, Vercel AI SDK, etc.) directly in your framework routes instead. ' +
	'See https://agentuity.dev/docs/migration';

/**
 * @deprecated Use a dedicated framework with @agentuity/hono middleware.
 */
export function createApp(): never {
	throw new Error(appMessage);
}

/**
 * @deprecated Use Hono directly: `new Hono()`
 */
export function createRouter(): never {
	throw new Error(appMessage);
}

/**
 * @deprecated Use an AI SDK (OpenAI, Vercel AI SDK, etc.) directly in your framework routes.
 */
export function createAgent(): never {
	console.warn(
		'[DEPRECATED] createAgent() is deprecated in Agentuity v3. ' +
			'Use an AI SDK (OpenAI, Vercel AI SDK, etc.) directly in your framework routes instead. ' +
			'See https://agentuity.dev/docs/migration'
	);
	throw new Error(agentMessage);
}
