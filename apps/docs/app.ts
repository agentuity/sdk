import { createApp, isDevMode } from '@agentuity/runtime';
import { mimeTypes } from '@agentuity/server';
import { join } from 'node:path';

const { server, logger, router } = await createApp({
	setup: async () => {
		// anything you return from this will be automatically
		// available in the ctx.app. this allows you to initialize
		// global resources and make them available to routes and
		// agents in a typesafe way
	},
	shutdown: async (_state) => {
		// the state variable will be the same value was what you
		// return from setup above. you can use this callback to
		// close any resources or other shutdown related tasks
	},
});

// Dev mode: serve static files from src/web/public/.
// In production, these are served automatically by the runtime with correct MIME types.
if (isDevMode()) {
	const { serveStatic } = await import('hono/bun');
	const publicDir = join(import.meta.dir, '..', 'src/web/public');
	router.use('/*', serveStatic({ root: publicDir, mimes: mimeTypes }));
}

logger.debug('Running %s', server.url);
