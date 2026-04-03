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

function asObject(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

function getPublishedOffset(result: unknown): number | undefined {
	const direct = asObject(result);
	const data = asObject(direct?.data);
	const message = asObject(data?.message);

	return asNumber(direct?.offset) ?? asNumber(message?.offset);
}

function formatPublishedMessage(task: string, offset?: number): string {
	if (offset !== undefined) {
		return `Published: ${task} (offset ${offset})`;
	}

	return `Published: ${task}`;
}

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

	const firstPublish = await ctx.queue.publish(
		queueName,
		{ task: 'process-data', priority: 'normal' },
		{ sync: true }
	);
	const firstOffset = getPublishedOffset(firstPublish);
	ctx.logger.info('Published process-data job');

	const secondPublish = await ctx.queue.publish(
		queueName,
		{ task: 'generate-report', priority: 'high' },
		{ sync: true, metadata: { source: 'explorer' } }
	);
	const secondOffset = getPublishedOffset(secondPublish);
	ctx.logger.info('Published generate-report job');

	console.log('---OUTPUT---');
	console.log(`Created: "${queue.name}" (${queue.queueType})`);
	console.log(formatPublishedMessage('process-data', firstOffset));
	console.log(formatPublishedMessage('generate-report', secondOffset));
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	// Always clean up the queue, even if publishing failed
	try {
		ctx.logger.info('Deleting queue');
		await ctx.queue.deleteQueue(queueName);
		ctx.logger.info('Queue deleted');
		console.log(`Deleted: "${queueName}"`);
	} catch {
		ctx.logger.warn('Failed to delete queue during cleanup', { name: queueName });
		console.log(`Cleanup failed: could not delete "${queueName}"`);
	}
}
