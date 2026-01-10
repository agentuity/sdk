/**
 * Vector Route - Vector store search with semantic product matching.
 *
 * POST /seed   - Populates vector store with sample products
 * POST /search - Searches products by query and returns AI recommendation
 * GET /status  - Checks if vector store contains data
 */
import { createRouter } from '@agentuity/runtime';
import vectorAgent from '../../agent/vector/agent';

const router = createRouter();

router.post('/seed', async (c) => {
	await vectorAgent.run({
		query: 'office chair',
		seedData: true,
	});
	return c.json({
		success: true,
		message: 'Seeded sample products',
		note: 'Sample products loaded into vector store',
	});
});

router.post('/search', async (c) => {
	const body = await c.req.json();
	const { query } = body as { query?: unknown };

	if (typeof query !== 'string' || !query.trim()) {
		return c.json({ success: false, error: 'Query must be a non-empty string' }, 400);
	}

	const result = await vectorAgent.run({ query });
	return c.json({
		success: true,
		query,
		matches: result.matches,
		recommendation: result.recommendation,
		recommendedSKU: result.recommendedSKU,
	});
});

router.get('/status', async (c) => {
	try {
		// Quick search to verify data actually exists in the namespace
		const results = await c.var.vector?.search('sdk-explorer', {
			query: 'chair',
			limit: 1,
			similarity: 0.1,
		});
		const hasData = (results?.length ?? 0) > 0;
		return c.json({ success: true, hasData });
	} catch (error) {
		c.var.logger?.error('Vector status check failed', { error });
		return c.json({ success: false, error: 'Vector service unavailable' }, 503);
	}
});

export default router;
