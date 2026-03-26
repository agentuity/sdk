import { createRouter } from '@agentuity/runtime';
import docProcessingAgent from '@agent/doc_processing';
import { bearerTokenAuth } from '../../middleware/auth';

const router = createRouter();

// POST /api/process-docs-sync
// Synchronous variant — awaits processing and returns stats to the caller.
router.post('/', bearerTokenAuth, docProcessingAgent.validator(), async (c) => {
	const data = c.req.valid('json');

	c.var.logger.info('Starting synchronous docs sync', {
		changed: data.changed?.length ?? 0,
		removed: data.removed?.length ?? 0,
		commit: data.commit,
	});

	try {
		const result = await docProcessingAgent.run(data);
		return c.json(result);
	} catch (err) {
		c.var.logger.error('Synchronous docs sync failed', { error: err, commit: data.commit });
		return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
	}
});

export default router;
