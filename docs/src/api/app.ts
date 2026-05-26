import { Hono } from 'hono';
import router from '.';
import { attachDemoContext, type ApiEnv } from './context';

export function createDocsApiApp(): Hono<ApiEnv> {
	const app = new Hono<ApiEnv>();

	app.use('*', attachDemoContext);
	app.route('/api', router);

	return app;
}

export const docsApiApp = createDocsApiApp();

export default {
	fetch: docsApiApp.fetch,
};
