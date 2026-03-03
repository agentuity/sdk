import { createRouter } from '@agentuity/runtime';
import docProcessingAgent from '@agent/doc_processing/index.ts';
import { bearerTokenAuth } from '../../middleware/auth.ts';

const router = createRouter();

// POST /api/process-docs
router.post('/', bearerTokenAuth, docProcessingAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await docProcessingAgent.run(data);
	return c.json(result);
});

export default router;
