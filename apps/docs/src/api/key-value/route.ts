/**
 * KV Route - Key-Value storage operations using KV agent.
 *
 * GET /keys      - Lists all stored keys
 * GET /get/:key  - Retrieves value for specified key
 * POST /seed     - Seeds KV store with sample data
 */
import type { Env } from '@agentuity/runtime';
import kvAgent from '../../agent/kv/agent';
import { Hono } from 'hono';

const router = new Hono<Env>()

	.get('/keys', async (c) => {
		const result = await kvAgent.run({ action: 'list' });
		return c.json({ success: result.success, keys: result.data ?? [] });
	})

	.get('/get/:key', async (c) => {
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
	})

	.post('/seed', async (c) => {
		const result = await kvAgent.run({ action: 'seed' });
		return c.json(result);
	});

export default router;
