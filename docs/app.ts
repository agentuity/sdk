import { Hono } from 'hono';
import { websocket } from 'hono/bun';
import router from './src/api';
import { attachDemoContext, type ApiEnv } from './src/api/context';
import { docRedirectRules, getDemoRedirectTarget } from './src/web/lib/docs-redirects';

const app = new Hono<ApiEnv>();

// Permanent server-side redirects for legacy docs URLs
// Some matching TanStack routes handle redirects during client navigation
for (const rule of docRedirectRules) {
	for (const path of rule.paths) {
		app.get(path, (c) => c.redirect(rule.target, 301));
	}
}

app.get('/demo/:rest{.+}', (c) => {
	return c.redirect(getDemoRedirectTarget(c.req.param('rest')), 301);
});

app.use('/api/*', attachDemoContext);
app.route('/api', router);

export default {
	fetch: app.fetch,
	websocket,
};
