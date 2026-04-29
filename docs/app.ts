import { createApp } from '@agentuity/runtime';
import { Hono } from 'hono';
import router from './src/api';
import agents from './src/agent';
import { docRedirectRules, getDemoRedirectTarget } from './src/web/lib/docs-redirects';

const redirects = new Hono();

// Permanent server-side redirects for legacy docs URLs
// Some matching TanStack routes handle redirects during client navigation
for (const rule of docRedirectRules) {
	for (const path of rule.paths) {
		redirects.get(path, (c) => c.redirect(rule.target, 301));
	}
}

redirects.get('/demo/:rest{.+}', (c) => {
	return c.redirect(getDemoRedirectTarget(c.req.param('rest')), 301);
});

const app = await createApp({
	router: [
		{ path: '/', router: redirects },
		{ path: '/api', router },
	],
	agents,
});

app.logger.debug('Running %s', app.server.url);

export default app;
