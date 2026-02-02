import { createRouter } from '@agentuity/runtime';
import hello from '../../agent/hello/agent';

export const inputSchema = hello.inputSchema;
export const outputSchema = hello.outputSchema;

const router = createRouter();

router.post('/', hello.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await hello.run(data);
	return c.json(result);
});

export default router;
