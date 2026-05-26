/**
 * Chat Route - Basic conversational agent with optional tool calling.
 *
 * POST / - Send message to chat agent (with optional command)
 * GET  / - Usage information
 */
import type { ApiEnv } from '../context';
import chatAgent from '../../agent/chat/agent';
import { Hono } from 'hono';

const router = new Hono<ApiEnv>()

	.post('/', async (c) => {
		const data = await c.req.json();
		const result = await chatAgent.run(data);
		return c.json(result);
	})

	.get('/', async (c) => {
		return c.json({
			message: 'Use POST /api/chat to send messages',
		});
	});

export default router;
