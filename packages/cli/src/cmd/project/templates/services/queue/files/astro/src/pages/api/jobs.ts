import type { APIRoute } from 'astro';
import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';
const QUEUE_DESCRIPTION = 'Queued translation requests from the Agentuity starter template';

export const POST: APIRoute = async ({ request }) => {
	const payload = await request.json();
	await queue.createQueue(QUEUE_NAME, { description: QUEUE_DESCRIPTION });
	const job = await queue.publish(QUEUE_NAME, payload, {
		metadata: { kind: 'translation' },
	});
	return new Response(JSON.stringify(job), {
		headers: { 'Content-Type': 'application/json' },
	});
};
