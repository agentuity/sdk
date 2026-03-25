import { createRouter } from '@agentuity/runtime';
import docProcessingAgent from '@agent/doc_processing';
import { bearerTokenAuth } from '../../middleware/auth';

const router = createRouter();

// POST /api/process-docs
router.post('/', bearerTokenAuth, docProcessingAgent.validator(), async (c) => {
	const data = c.req.valid('json');

	const changedCount = data.changed?.length ?? 0;
	const removedCount = data.removed?.length ?? 0;

	c.var.logger.info('Accepted docs sync request', {
		changed: changedCount,
		removed: removedCount,
		commit: data.commit,
	});

	// Respond immediately; processing continues in the background.
	c.waitUntil(async () => {
		try {
			const result = await docProcessingAgent.run(data);
			c.var.logger.info('Docs sync complete', result);
		} catch (err) {
			c.var.logger.error('Docs sync failed', { error: err, commit: data.commit });
		}
	});

	return c.json({
		status: 'accepted',
		message: `Processing ${changedCount} changed and ${removedCount} removed files in background`,
	});
});

export default router;
