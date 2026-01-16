/**
 * Queue Test App
 *
 * A standalone Bun app to test the Queue API from @agentuity/server.
 * This creates a queue, publishes messages, receives/acknowledges them, and cleans up.
 */

import { ConsoleLogger, getServiceUrls } from '@agentuity/server';
import {
	APIClient,
	createQueue,
	getQueue,
	listQueues,
	publishMessage,
	batchPublishMessages,
	receiveMessage,
	ackMessage,
	nackMessage,
	listMessages,
	deleteQueue,
	pauseQueue,
	resumeQueue,
	type Queue,
} from '@agentuity/server';

const logger = new ConsoleLogger();

async function main() {
	console.log('🚀 Starting Queue API Test...\n');

	const region = process.env.AGENTUITY_REGION || 'local';
	const serviceUrls = getServiceUrls(region);

	console.log('Environment:');
	console.log(`   AGENTUITY_SDK_KEY: ***${process.env.AGENTUITY_SDK_KEY?.slice(-4) || 'NOT SET'}`);
	console.log(`   AGENTUITY_REGION: ${region}`);
	console.log(`   Catalyst URL: ${serviceUrls.catalyst}`);
	console.log();

	const client = new APIClient(serviceUrls.catalyst, logger);
	const queueName = `test-queue-${Date.now()}`;
	let createdQueue: Queue | null = null;

	try {
		// 1. Create a worker queue
		console.log('📦 Creating worker queue...');
		createdQueue = await createQueue(client, {
			name: queueName,
			queue_type: 'worker',
			description: 'SDK Queue API Test',
			settings: {
				default_max_retries: 3,
				default_visibility_timeout_seconds: 30,
			},
		});
		console.log(`✅ Queue created: ${createdQueue.name}`);
		console.log(`   ID: ${createdQueue.id}`);
		console.log(`   Type: ${createdQueue.queue_type}`);
		console.log();

		// 2. Get queue details
		console.log('📋 Getting queue info...');
		const queueInfo = await getQueue(client, queueName);
		console.log(`   Name: ${queueInfo.name}`);
		console.log(`   Type: ${queueInfo.queue_type}`);
		console.log(`   Messages: ${queueInfo.stats?.message_count ?? 0}`);
		console.log();

		// 3. List all queues
		console.log('📜 Listing queues...');
		const { queues, total } = await listQueues(client, { limit: 10 });
		console.log(`   Found ${queues.length} queues (total: ${total ?? 'unknown'})`);
		const found = queues.find((q) => q.name === queueName);
		console.log(`   Test queue in list: ${found ? 'Yes' : 'No'}`);
		console.log();

		// 4. Publish a single message
		console.log('📤 Publishing single message...');
		const msg1 = await publishMessage(client, queueName, {
			payload: JSON.stringify({ task: 'process-order', orderId: 123 }),
			metadata: { priority: 'high' },
		});
		console.log(`✅ Message published: ${msg1.id}`);
		console.log(`   Offset: ${msg1.offset}`);
		console.log();

		// 5. Batch publish messages
		console.log('📤 Batch publishing 3 messages...');
		const batchResult = await batchPublishMessages(client, queueName, [
			{ payload: JSON.stringify({ task: 'task-1' }) },
			{ payload: JSON.stringify({ task: 'task-2' }) },
			{ payload: JSON.stringify({ task: 'task-3' }) },
		]);
		console.log(`✅ Batch published ${batchResult.messages.length} messages`);
		console.log();

		// 6. List messages
		console.log('📜 Listing messages...');
		const { messages } = await listMessages(client, queueName, { limit: 10 });
		console.log(`   Found ${messages.length} messages`);
		console.log();

		// 7. Receive and acknowledge a message
		console.log('📥 Receiving message...');
		const received = await receiveMessage(client, queueName);
		if (received) {
			console.log(`✅ Received message: ${received.id}`);
			console.log(`   Payload: ${received.payload.substring(0, 50)}...`);
			console.log(`   State: ${received.state}`);

			console.log('✅ Acknowledging message...');
			await ackMessage(client, queueName, received.id);
			console.log('   Message acknowledged');
		} else {
			console.log('   No messages available');
		}
		console.log();

		// 8. Receive and nack a message (return to queue)
		console.log('📥 Receiving another message...');
		const received2 = await receiveMessage(client, queueName);
		if (received2) {
			console.log(`✅ Received message: ${received2.id}`);
			console.log('↩️  Returning message to queue (nack)...');
			await nackMessage(client, queueName, received2.id);
			console.log('   Message returned to queue');
		}
		console.log();

		// 9. Pause and resume queue
		console.log('⏸️  Pausing queue...');
		const pausedQueue = await pauseQueue(client, queueName);
		console.log(`   Paused at: ${pausedQueue.paused_at}`);

		console.log('▶️  Resuming queue...');
		const resumedQueue = await resumeQueue(client, queueName);
		console.log(`   Paused at: ${resumedQueue.paused_at ?? 'null (resumed)'}`);
		console.log();

		// 10. Delete the queue
		console.log('🗑️  Deleting queue...');
		await deleteQueue(client, queueName);
		console.log('✅ Queue deleted');
		createdQueue = null;
		console.log();

		console.log('✨ Queue API test completed successfully!');
	} catch (error) {
		console.error('❌ Error:', error instanceof Error ? error.message : error);

		// Cleanup on error
		if (createdQueue) {
			console.log('\n🧹 Cleaning up...');
			try {
				await deleteQueue(client, queueName);
				console.log('   Queue deleted');
			} catch {
				console.log('   Failed to delete queue (may already be deleted)');
			}
		}

		process.exit(1);
	}
}

main();
