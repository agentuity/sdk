import { NextResponse } from 'next/server';
import { QueueClient } from '@agentuity/queue';

const queue = new QueueClient();
const QUEUE_NAME = 'translate-jobs';

export async function POST(request: Request) {
	const payload = await request.json();
	const { id } = await queue.publish(QUEUE_NAME, payload);
	return NextResponse.json({ id });
}
