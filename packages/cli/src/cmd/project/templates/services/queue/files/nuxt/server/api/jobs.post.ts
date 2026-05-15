import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';
const QUEUE_DESCRIPTION = 'Queued translation requests from the Agentuity starter template';

export default defineEventHandler(async (event) => {
	const payload = await readBody(event);
	await queue.createQueue(QUEUE_NAME, { description: QUEUE_DESCRIPTION });
	return queue.publish(QUEUE_NAME, payload, {
		metadata: { kind: 'translation' },
	});
});
