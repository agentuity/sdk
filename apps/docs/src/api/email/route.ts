/**
 * Email Route - Send templated emails.
 *
 * POST / - Send an email using a template and name
 */
import { createRouter } from '@agentuity/runtime';
import emailAgent from '../../agent/email/agent';

const router = createRouter();

router.post('/', emailAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await emailAgent.run(data);
	return c.json(result);
});

export default router;
