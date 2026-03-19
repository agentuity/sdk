/**
 * Queue Test App
 *
 * A simple standalone Bun app to test the QueueClient from @agentuity/queue.
 * Demonstrates creating queues and publishing messages.
 */

import { QueueClient } from '@agentuity/queue';

async function main() {
	console.log('🚀 Starting Queue Test...\n');

	const client = new QueueClient();

	// Generate a unique queue name to avoid conflicts
	const randomSuffix = Date.now().toString(36);
	const QUEUE_NAME = `test-queue-${randomSuffix}`;

	// ============================================================
	// Test 1: Create a queue
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Create a queue');
	console.log('═'.repeat(60));

	console.log(`\n📦 Creating queue "${QUEUE_NAME}"...`);
	await client.createQueue(QUEUE_NAME);
	console.log('   ✅ Queue created');

	// ============================================================
	// Test 2: Publish messages
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 2: Publish messages');
	console.log('═'.repeat(60));

	console.log('\n📤 Publishing message 1...');
	const result1 = await client.publish(QUEUE_NAME, {
		task: 'process-image',
		imageUrl: 'https://example.com/photo.jpg',
		timestamp: new Date().toISOString(),
	});
	console.log(`   ✅ Message published: id=${result1.id}, offset=${result1.offset}`);

	console.log('\n📤 Publishing message 2...');
	const result2 = await client.publish(QUEUE_NAME, {
		task: 'send-notification',
		userId: 'user-123',
		message: 'Your order has shipped!',
	});
	console.log(`   ✅ Message published: id=${result2.id}, offset=${result2.offset}`);

	console.log('\n📤 Publishing message 3...');
	const result3 = await client.publish(QUEUE_NAME, {
		task: 'generate-report',
		reportType: 'monthly-summary',
		month: '2026-03',
	});
	console.log(`   ✅ Message published: id=${result3.id}, offset=${result3.offset}`);

	console.log('\n' + '═'.repeat(60));
	console.log('✨ Queue test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
