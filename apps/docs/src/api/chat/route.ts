/**
 * Chat Route - Basic conversational agent with optional tool calling.
 *
 * POST / - Send message to chat agent (with optional command)
 * GET  / - Usage information
 */
import { createRouter } from '@agentuity/runtime';
import chatAgent from '../../agent/chat/agent';

const router = createRouter();

router.post('/', chatAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await chatAgent.run(data);
	return c.json(result);
});

router.get('/', async (c) => {
	return c.json({
		message: 'Use POST /api/chat to send messages',
	});
});

export default router;
