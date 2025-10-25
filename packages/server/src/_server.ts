/* eslint-disable @typescript-eslint/no-unused-vars */
import { type Env, Hono } from 'hono';
import { BunWebSocketData, websocket } from 'hono/bun';
import type { AppConfig } from './app';

let globalServerInstance: Bun.Server<BunWebSocketData> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalAppInstance: Hono<any> | null = null;

export function getServer() {
	return globalServerInstance;
}

export function getApp() {
	return globalAppInstance;
}

export const createServer = <E extends Env>(app: Hono<E>, _config?: AppConfig) => {
	if (globalServerInstance) {
		return globalServerInstance;
	}
	const port = Number.parseInt(process.env.AGENTUITY_PORT ?? process.env.PORT ?? '3000') || 3000;

	const server = Bun.serve({
		fetch: app.fetch,
		idleTimeout: 0,
		port,
		websocket,
	});

	globalAppInstance = app;
	globalServerInstance = server;

	return server;
};
