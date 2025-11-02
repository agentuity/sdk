import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import agent from './agent';

const router = createRouter();

// Define specific schemas for route-specific endpoints
const addMemberSchema = z.object({
	name: z.string(),
	testRunId: z.string().optional(),
});

const removeMemberSchema = z.object({
	name: z.string(),
	testRunId: z.string().optional(),
});

router.get('/', async (c) => {
	const result = await c.agent.team.members.run({ action: 'list' });
	return c.json(result);
});

if (!agent.inputSchema) {
	throw new Error('Agent inputSchema is required for POST route validation');
}

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run(data);
	return c.json(result);
});

router.post('/add', zValidator('json', addMemberSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run({
		action: 'add',
		name: data.name,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

router.post('/remove', zValidator('json', removeMemberSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run({
		action: 'remove',
		name: data.name,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

export default router;
