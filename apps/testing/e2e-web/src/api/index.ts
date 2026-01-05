import { createRouter } from '@agentuity/runtime';
import hello from '../agent/hello/agent';

const api = createRouter();

api.post('/hello', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

api.get('/users/:userId', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || userId.length > 100) {
		return c.json({ error: 'Invalid userId' }, 400);
	}
	return c.json({ userId, name: `User ${userId}` });
});

api.get('/organizations/:orgId/members/:memberId', async (c) => {
	const orgId = c.req.param('orgId');
	const memberId = c.req.param('memberId');
	if (!orgId || orgId.length > 100 || !memberId || memberId.length > 100) {
		return c.json({ error: 'Invalid orgId or memberId' }, 400);
	}
	return c.json({ orgId, memberId });
});

api.get('/search', async (c) => {
	const query = c.req.query('q') || '';
	const limitStr = c.req.query('limit') || '10';
	const limit = parseInt(limitStr, 10);
	return c.json({ query, limit: Number.isNaN(limit) ? 10 : limit });
});

export default api;
