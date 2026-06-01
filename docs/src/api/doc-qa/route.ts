import type { ApiEnv } from '../context';
import { answerDocsQuestion } from '../../assistant/doc-qa';
import { documentPathToUrl } from '../../lib/doc-urls';
import { Hono } from 'hono';
import { z } from 'zod';

const DocQaRequestSchema = z.object({
	message: z.string().min(1, 'Message is required'),
});

const router = new Hono<ApiEnv>()

	// POST /api/doc-qa - Answer questions about documentation
	.post('/', async (c) => {
		const parsed = DocQaRequestSchema.safeParse(await c.req.json());
		if (!parsed.success) {
			return c.json({ error: 'Invalid Doc QA request' }, 400);
		}

		try {
			const result = await answerDocsQuestion(c.var, parsed.data.message);
			const documents = result.documents.map((doc) => ({
				...doc,
				url: documentPathToUrl(doc.url),
			}));
			return c.json({ ...result, documents });
		} catch (error) {
			c.var.logger.error('Doc QA search failed', { error });
			return c.json({
				answer:
					"I couldn't search the docs just now. You can still use keyword search, or try again in a moment.",
				documents: [],
			});
		}
	});

export default router;
