import { type Env } from '@agentuity/runtime';
import docQAAgent from '@agent/doc_qa';
import { documentPathToUrl } from '../../lib/doc-urls';
import { Hono } from 'hono';

const router = new Hono<Env>()

	// POST /api/doc-qa - Answer questions about documentation
	.post('/', docQAAgent.validator(), async (c) => {
		const data = c.req.valid('json');
		let result: Awaited<ReturnType<typeof docQAAgent.run>>;
		try {
			result = await docQAAgent.run(data);
		} catch (error) {
			c.var.logger.error('Doc QA search failed', { error });
			return c.json({
				answer:
					"I couldn't search the docs just now. You can still use keyword search, or try again in a moment.",
				documents: [],
			});
		}

		// Transform document URLs from raw paths to proper URLs
		if (result.documents && Array.isArray(result.documents)) {
			result.documents = result.documents.map((doc) => ({
				...doc,
				url: documentPathToUrl(doc.url),
			}));
		}

		return c.json(result);
	});

export default router;
