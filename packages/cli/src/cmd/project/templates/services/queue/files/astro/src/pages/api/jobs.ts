import type { APIRoute } from 'astro';
import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';

export const POST: APIRoute = async ({ request }) => {
	const payload = await request.json();
	const { id } = await queue.publish(QUEUE_NAME, payload);
	return new Response(JSON.stringify({ id }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
