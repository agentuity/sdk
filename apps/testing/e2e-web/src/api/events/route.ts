import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const outputSchema = s.object({
	event: s.string(),
	count: s.number(),
});

const router = createRouter();

router.sse('/', (c) => async (stream) => {
	let count = 0;

	for (let i = 0; i < 5; i++) {
		count++;
		stream.writeSSE({
			data: JSON.stringify({ event: 'tick', count }),
		});
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
});

export default router;
