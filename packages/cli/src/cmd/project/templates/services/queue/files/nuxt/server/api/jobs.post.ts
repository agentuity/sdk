import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();

export default defineEventHandler(async (event) => {
	const payload = await readBody(event);
	const { id } = await queue.publish('translate-jobs', payload);
	return { id };
});
