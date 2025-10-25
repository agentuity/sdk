import { type Env as HonoEnv, Hono } from 'hono';
import { createServer, getLogger } from './_server';
import type { Logger } from './logger';
import { type Meter, type Tracer } from '@opentelemetry/api';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppConfig {
	// currently empty but may be extended in the future
}

export interface Variables {
	logger: Logger;
	meter: Meter;
	tracer: Tracer;
}

export interface Env extends HonoEnv {
	Variables: Variables;
}

/**
 * create a new app instance
 *
 * @returns App instance
 */
export function createApp(config?: AppConfig) {
	const app = new Hono<Env>();
	const server = createServer(app, config);
	const logger = getLogger() as Logger;
	return { app, server, logger };
}
