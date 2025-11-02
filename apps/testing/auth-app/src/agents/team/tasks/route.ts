import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import agent from './agent';

const router = createRouter();

// Define specific schemas for route-specific endpoints
const addTaskSchema = z.object({
	task: z.string(),
	testRunId: z.string().optional(),
});

const completeTaskSchema = z
	.object({
		id: z.string().optional(),
		task: z.string().optional(),
		testRunId: z.string().optional(),
	})
	.refine((data) => data.id || data.task, {
		message: 'Either "id" or "task" must be provided',
	});

router.get('/', async (c) => {
	const result = await c.agent.team.tasks.run({ action: 'list' });
	return c.json(result);
});

if (!agent.inputSchema) {
	throw new Error('Agent inputSchema is required for POST route validation');
}

router.post('/', zValidator('json', agent.inputSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.tasks.run(data);
	return c.json(result);
});

router.post('/add', zValidator('json', addTaskSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.tasks.run({
		action: 'add',
		task: data.task,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

router.post('/complete', zValidator('json', completeTaskSchema), async (c) => {
	const data = c.req.valid('json');
	const result = await c.agent.team.tasks.run({
		action: 'complete',
		task: data.id || data.task,
		testRunId: data.testRunId,
	});
	return c.json(result);
});

export default router;
