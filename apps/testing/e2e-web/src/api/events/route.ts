import { Hono } from 'hono';
import { sse } from '@agentuity/runtime';
import type { Env } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const outputSchema = s.object({
	event: s.string(),
	count: s.number(),
});

const router = new Hono<Env>().get(
	'/',
	sse(async (_c, stream) => {
		let count = 0;

		for (let i = 0; i < 5; i++) {
			count++;
			stream.writeSSE({
				data: JSON.stringify({ event: 'tick', count }),
			});
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	})
);

export default router;
