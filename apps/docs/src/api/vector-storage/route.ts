/**
 * Vector Route - Vector store search with semantic product matching.
 *
 * POST /seed   - Populates vector store with sample products
 * POST /search - Searches products by query and returns AI recommendation
 * GET /status  - Checks if vector store contains data
 */
import { type Env } from '@agentuity/runtime';
import vectorAgent from '../../agent/vector/agent';
import sampleProducts from '../../agent/vector/sample-products.json';
import { Hono } from 'hono';

const VECTOR_NAMESPACE = 'sdk-explorer';

function getVectorSeedDocuments() {
	return sampleProducts.map((product) => ({
		key: product.sku,
		document: `${product.name}: ${product.description} ${product.customer_feedback}`,
		metadata: product,
	}));
}

const router = new Hono<Env>()

	.post('/seed', async (c) => {
		try {
			await c.var.vector.upsert(VECTOR_NAMESPACE, ...getVectorSeedDocuments());

			return c.json({
				success: true,
				message: 'Seeded sample products',
				note: 'Sample products loaded into vector store',
			});
		} catch (error) {
			c.var.logger?.error('Vector seed failed', { error });
			const message = error instanceof Error ? error.message : 'Vector seed failed';
			return c.json({ success: false, error: message }, 503);
		}
	})

	.post('/search', async (c) => {
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
	})

	.get('/status', async (c) => {
		try {
			// Quick search to verify data actually exists in the namespace
			const results = await c.var.vector?.search(VECTOR_NAMESPACE, {
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
