import { createApp } from '@agentuity/runtime';
import { Hono } from 'hono';
import router from './src/api';
import agents from './src/agent';

const redirects = new Hono()
	// Demo routes → Explorer
	.get('/demo/', (c) => c.redirect('/explorer', 301))
	.get('/demo/:rest{.+}', (c) => {
		return c.redirect(`/explorer/${c.req.param('rest')}`, 301);
	})
	.get('/demo', (c) => c.redirect('/explorer', 301))
	// Permanent server-side redirects for legacy docs URLs.
	// Matching TanStack routes handle the same redirects during SPA navigation.
	.get('/apis/calling-agents', (c) => c.redirect('/routes/calling-agents', 301))
	.get('/apis/when-to-use', (c) => c.redirect('/agents/when-to-use', 301))
	.get('/apis/', (c) => c.redirect('/agents', 301))
	.get('/apis', (c) => c.redirect('/agents', 301));

const app = await createApp({
	router: [
		{ path: '/', router: redirects },
		{ path: '/api', router },
	],
	agents,
});

app.logger.debug('Running %s', app.server.url);

export default app;
