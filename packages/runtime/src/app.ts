import { type Env as HonoEnv, Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer, getLogger } from './_server';
import type { Logger } from './logger';
import { type Meter, type Tracer } from '@opentelemetry/api';
import {
	type KeyValueStorage,
	type ObjectStorage,
	type StreamStorage,
	type VectorStorage,
} from '@agentuity/core';

type CorsOptions = Parameters<typeof cors>[0];

export interface AppConfig {
	/**
	 * Override the default cors settings
	 */
	cors?: CorsOptions;
	/**
	 * Override the default services
	 */
	services?: {
		useLocal?: boolean;
		keyvalue?: KeyValueStorage;
		object?: ObjectStorage;
		stream?: StreamStorage;
		vector?: VectorStorage;
	};
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
