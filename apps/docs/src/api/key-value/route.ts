/**
 * KV Route - Key-Value storage operations using KV agent.
 *
 * GET /keys      - Lists all stored keys
 * GET /get/:key  - Retrieves value for specified key
 * POST /seed     - Seeds KV store with sample data
 */
import { createRouter } from '@agentuity/runtime';
import kvAgent from '../../agent/kv/agent';

const router = createRouter();

router.get('/keys', async (c) => {
	const result = await kvAgent.run({ action: 'list' });
	return c.json({ success: result.success, keys: result.data ?? [] });
});

router.get('/get/:key', async (c) => {
	const key = c.req.param('key');
	const result = await kvAgent.run({ action: 'get', key });

	if (!result.success) {
		return c.json({ success: false, error: result.message }, 404);
	}

	return c.json({
		success: true,
		key,
		value: result.data,
	});
});

router.post('/seed', async (c) => {
	const result = await kvAgent.run({ action: 'seed' });
	return c.json(result);
});

export default router;
