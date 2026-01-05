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
	return c.json({ userId, name: `User ${userId}` });
});

api.get('/organizations/:orgId/members/:memberId', async (c) => {
	const orgId = c.req.param('orgId');
	const memberId = c.req.param('memberId');
	return c.json({ orgId, memberId });
});

api.get('/search', async (c) => {
	const query = c.req.query('q') || '';
	const limit = c.req.query('limit') || '10';
	return c.json({ query, limit: parseInt(limit) });
});

export default api;
