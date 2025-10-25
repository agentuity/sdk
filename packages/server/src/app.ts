import { type Env, Hono } from 'hono';
import { createServer } from './_server';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppConfig {
	// currently empty but may be extended in the future
}

/**
 * create a new app instance
 *
 * @returns App instance
 */
export const createApp = <E extends Env = Env>(config?: AppConfig) => {
	const app = new Hono<E>();
	const server = createServer(app, config);
	return { app, server };
};
