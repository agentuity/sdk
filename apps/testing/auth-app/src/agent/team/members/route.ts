import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import agent from './agent';

const router = createRouter();

// Define specific schemas for route-specific endpoints
const addMemberSchema = s.object({
	name: s.string(),
	testRunId: s.string().optional(),
});

const removeMemberSchema = s.object({
	name: s.string(),
	testRunId: s.string().optional(),
});

router.get('/', async (c) => {
	const result = await c.agent.team.members.run({ action: 'list' });
	return c.json(result);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run(data);
	return c.json(result);
});

router.post('/add', agent.validator({ input: addMemberSchema }), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run({
		action: 'add',
		name: data.name,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

router.post('/remove', agent.validator({ input: removeMemberSchema }), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.members.run({
		action: 'remove',
		name: data.name,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

export default router;
