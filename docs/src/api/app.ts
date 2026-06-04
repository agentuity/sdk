import { Hono } from 'hono';
import router from '.';
import { attachDemoContext, type ApiEnv } from './context';

export function createDocsApiApp(): Hono<ApiEnv> {
	const app = new Hono<ApiEnv>();

	app.use('*', attachDemoContext);
	app.route('/api', router);

	// Demos throw when a backing service is unavailable (e.g. missing cloud
	// credentials in local dev). Return structured JSON instead of Hono's
	// default text/plain "Internal Server Error" so the client's
	// response.json() surfaces a clean message instead of crashing with
	// "Unexpected token 'I', \"Internal S\"... is not valid JSON".
	app.onError((err, c) => {
		const message = err instanceof Error ? err.message : 'Internal Server Error';
		c.var.logger?.error('Unhandled demo API error', { error: message });
		return c.json({ success: false, error: message, message }, 500);
	});

	return app;
}

export const docsApiApp = createDocsApiApp();

export default {
	fetch: docsApiApp.fetch,
};
