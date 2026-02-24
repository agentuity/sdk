import { createRouter } from '@agentuity/runtime';
import docProcessingAgent from '@agent/doc_processing';
import { bearerTokenAuth } from '../../middleware/auth';

const router = createRouter();

// POST /api/process-docs
// Returns 202 immediately and processes docs in the background.
// Processing 85+ MDX files takes 3-4 minutes, exceeding HTTP gateway timeouts.
// We don't use docProcessingAgent.validator() here because that also validates
// the response body against the agent's output schema, and our 202 response
// has a different shape than the agent's output.
router.post('/', bearerTokenAuth, async (c) => {
	const data = await c.req.json();

	// Validate input against the agent's schema before scheduling background work
	if (docProcessingAgent.inputSchema) {
		const result = await docProcessingAgent.inputSchema['~standard'].validate(data);
		if (result.issues) {
			return c.json(
				{
					error: 'Invalid request body',
					issues: result.issues.map((i) => i.message),
				},
				400
			);
		}
	}

	const changedCount = data.changed?.length ?? 0;
	const removedCount = data.removed?.length ?? 0;

	// Reject early if there's nothing to process
	if (changedCount === 0 && removedCount === 0) {
		return c.json({ error: 'Must provide at least one changed or removed file' }, 400);
	}

	// Schedule doc processing to run in the background after the response is sent
	c.waitUntil(async () => {
		try {
			const result = await docProcessingAgent.run(data);
			c.var.logger?.info('Doc processing completed: %o', result);
		} catch (error) {
			c.var.logger?.error('Doc processing failed: %o', error);
		}
	});

	return c.json(
		{
			status: 'accepted',
			message: `Processing ${changedCount} changed and ${removedCount} removed files in background`,
		},
		202
	);
});

export default router;
