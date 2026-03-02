import { createApp } from '@agentuity/runtime';

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

// URL redirects for external links
router.get('/docs/*', (c) => {
	const path = c.req.path.replace(/^\/docs/, '');
	return c.redirect(path || '/', 301);
});
router.get('/routes/streaming', (c) => c.redirect('/routes', 301));

logger.debug('Running %s', server.url);
