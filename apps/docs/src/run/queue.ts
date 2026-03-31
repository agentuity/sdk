/**
 * Standalone run script for Queue demo
 *
 * Shows the agent-side queue API: create queue, publish messages, delete queue.
 * Consume-side operations (receive, ack, nack, DLQ) require the server API
 * client — see src/api/queue/route.ts for those.
 *
 * Usage: bun run src/run/queue.ts '{}'
 */
import { createAgentContext } from '@agentuity/runtime';

const ctx = createAgentContext();

const queueName = `explorer-sandbox-${Date.now().toString(36)}`;

try {
	// CREATE queue
	ctx.logger.info('Creating queue', { name: queueName });
	const queue = await ctx.queue.createQueue(queueName, {
		queueType: 'worker',
		settings: {
			defaultMaxRetries: 2,
			defaultVisibilityTimeoutSeconds: 5,
		},
	});
	ctx.logger.info('Queue created', { name: queue.name, type: queue.queueType });

	// PUBLISH two messages with different payloads
	ctx.logger.info('Publishing messages');

	const msg1 = await ctx.queue.publish(
		queueName,
		{ task: 'process-data', priority: 'normal' },
		{ sync: true }
	);
	ctx.logger.info('Published message 1', { id: msg1.id });

	const msg2 = await ctx.queue.publish(
		queueName,
		{ task: 'generate-report', priority: 'high' },
		{ sync: true, metadata: { source: 'explorer' } }
	);
	ctx.logger.info('Published message 2', { id: msg2.id });

	// DELETE queue (cleanup)
	ctx.logger.info('Deleting queue');
	await ctx.queue.deleteQueue(queueName);
	ctx.logger.info('Queue deleted');

	console.log('---OUTPUT---');
	console.log(`Created: "${queue.name}" (${queue.queueType})`);
	console.log(`Published: ${msg1.id} at offset ${msg1.offset}`);
	console.log(`Published: ${msg2.id} at offset ${msg2.offset}`);
	console.log(`Deleted: "${queueName}"`);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
