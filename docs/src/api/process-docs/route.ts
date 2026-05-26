import type { ApiEnv } from '../context';
import docProcessingAgent from '../../agent/doc_processing';
import { bearerTokenAuth } from '../../middleware/auth';
import { Hono } from 'hono';

const router = new Hono<ApiEnv>()
	// POST /api/process-docs
	// Processes docs synchronously and returns stats.
	// Callers should batch large payloads (~10 files per request).
	.post('/', bearerTokenAuth, async (c) => {
		const data = await c.req.json();

		c.var.logger.info('Starting docs sync', {
			changed: data.changed?.length ?? 0,
			removed: data.removed?.length ?? 0,
			commit: data.commit,
		});

		try {
			const result = await docProcessingAgent.run(data);
			return c.json(result);
		} catch (err) {
			c.var.logger.error('Docs sync failed', { error: err, commit: data.commit });
			return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
		}
	});

export default router;
