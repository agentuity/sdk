import { createApp } from '@agentuity/runtime';
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

// Serve markdown files at clean URLs (without /public/ prefix)
// import.meta.dir is .agentuity in dev, so go up one level to project root
const publicDir = join(import.meta.dir, '..', 'src/web/public');

const serveFile = async (filePath: string, contentType: string) => {
	const file = Bun.file(filePath);
	if (await file.exists()) {
		return new Response(file, {
			headers: { 'Content-Type': contentType },
		});
	}
	return null;
};

// Serve static files at clean URLs (without /public/ prefix)
// This handles: favicon.ico, *.md, *.txt
router.use('*', async (c, next) => {
	const path = c.req.path;

	// Map of paths/extensions to content types
	const staticFiles: Record<string, string> = {
		'/favicon.ico': 'image/x-icon',
	};

	// Check exact path matches first
	if (staticFiles[path]) {
		const res = await serveFile(join(publicDir, path), staticFiles[path]);
		if (res) return res;
	}

	// Then check extensions
	if (path.endsWith('.md')) {
		const res = await serveFile(join(publicDir, path), 'text/markdown; charset=utf-8');
		if (res) return res;
	}

	if (path.endsWith('.txt')) {
		const res = await serveFile(join(publicDir, path), 'text/plain; charset=utf-8');
		if (res) return res;
	}

	return next();
});

logger.debug('Running %s', server.url);
