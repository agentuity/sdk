export * from './agent';
export * from './app';
export * from './devmode';
export * from './router';
export * from './eval';
export * from './session';
export * from './workbench';
export * from './validator';
export type { Logger } from './logger';
export { getRouter, getAppState } from './_server';
export { Email, parseEmail } from './io/email';
export * from './services/evalrun';
export { getEvalRunEventProvider, getThreadProvider, getSessionProvider } from './_services';
export type { RouteSchema, GetRouteSchema } from './_validation';

/**
 * Application state interface that gets automatically augmented based on your createApp setup function.
 *
 * This interface is empty by default but gets populated with strongly-typed properties
 * when you define a setup function in createApp(). The Agentuity build tool automatically
 * generates type augmentations in `.agentuity/.agentuity_runtime.ts`.
 *
 * **How it works:**
 * 1. You define setup() in createApp() that returns an object
 * 2. The build tool generates module augmentation for this interface
 * 3. All agents get strongly-typed access to app state via `ctx.app`
 *
 * @example
 * ```typescript
 * // In your app.ts:
 * const app = await createApp({
 *   setup: async () => {
 *     const db = await connectDatabase();
 *     const redis = await connectRedis();
 *     return { db, redis };
 *   }
 * });
 *
 * // In your agent:
 * const agent = createAgent('user-query', {
 *   handler: async (ctx, input) => {
 *     // ctx.app is strongly typed with { db, redis }!
 *     const user = await ctx.app.db.query('SELECT * FROM users');
 *     await ctx.app.redis.set('key', 'value');
 *     return user;
 *   }
 * });
 * ```
 *
 * **Note:** If you're not seeing type hints for `ctx.app`, make sure you've run `bun run build`
 * to generate the type augmentations.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppState {}
