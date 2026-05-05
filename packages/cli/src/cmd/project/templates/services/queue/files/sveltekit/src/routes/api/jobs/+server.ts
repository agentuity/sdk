import { json } from '@sveltejs/kit';
import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';

export const POST = async ({ request }: { request: Request }) => {
	const payload = await request.json();
	const { id } = await queue.publish(QUEUE_NAME, payload);
	return json({ id });
};
