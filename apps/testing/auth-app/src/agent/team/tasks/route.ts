import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import agent from './agent';

const router = createRouter();

// Define specific schemas for route-specific endpoints
const addTaskSchema = s.object({
	task: s.string(),
	testRunId: s.string().optional(),
});

const completeTaskSchema = s.object({
	id: s.string().optional(),
	task: s.string().optional(),
	testRunId: s.string().optional(),
});

router.get('/', async (c) => {
	const result = await c.agent.team.tasks.run({ action: 'list' });
	return c.json(result);
});

router.post('/', agent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.tasks.run(data);
	return c.json(result);
});

router.post('/add', agent.validator({ input: addTaskSchema }), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.tasks.run({
		action: 'add',
		task: data.task,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

router.post('/complete', agent.validator({ input: completeTaskSchema }), async (c) => {
	const data = c.req.valid('json');
	if (!data.id && !data.task) {
		return c.json({ error: 'Either "id" or "task" must be provided' }, 400);
	}
	const result = await c.agent.team.tasks.run({
		action: 'complete',
		task: data.id || data.task,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

export default router;
