import { createApp } from '@agentuity/runtime';
import { getContentType } from '@agentuity/server';
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

// Dev mode: serve static files (.md, .txt, .xml) from src/web/public/.
// In production, these are served automatically by the runtime with correct MIME types.
const publicDir = join(import.meta.dir, '..', 'src/web/public');
const staticExtensions = ['.md', '.txt', '.xml', '.ico'];

router.use('*', async (c, next) => {
	const path = c.req.path;
	if (staticExtensions.some((ext) => path.endsWith(ext))) {
		const file = Bun.file(join(publicDir, path));
		if (await file.exists()) {
			return new Response(file, {
				headers: { 'Content-Type': getContentType(path) },
			});
		}
	}
	return next();
});

logger.debug('Running %s', server.url);
