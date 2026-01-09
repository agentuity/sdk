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
	// Always show "Load Sample Data" button - seeding is idempotent so it's safe to re-run
	return c.json({ success: true, hasData: false });
});

export default router;
