import { websocket } from 'hono/bun';
import { docsApiApp } from './app';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const hostname = process.env.HOST ?? '127.0.0.1';

Bun.serve({
	hostname,
	port,
	websocket,
	fetch(request, server) {
		return docsApiApp.fetch(request, server);
	},
});

console.log(`Docs API server listening on http://${hostname}:${port}`);
