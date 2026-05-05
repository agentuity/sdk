import { data } from 'react-router';
import { QueueClient } from '@agentuity/queue';
import type { Route } from './+types/api.jobs';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';

export async function action({ request }: Route.ActionArgs) {
	const payload = await request.json();
	const { id } = await queue.publish(QUEUE_NAME, payload);
	return data({ id });
}
