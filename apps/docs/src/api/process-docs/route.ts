import { type Env } from '@agentuity/runtime';
import docProcessingAgent from '@agent/doc_processing';
import { bearerTokenAuth } from '../../middleware/auth';
import { Hono } from 'hono';

const router = new Hono<Env>()
	// POST /api/process-docs
	.post('/', bearerTokenAuth, docProcessingAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		const result = await docProcessingAgent.run(data);
		return c.json(result);
	});

export default router;
