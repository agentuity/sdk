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

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

function getPublishedMessage(result: unknown) {
	const direct = asObject(result);
	const data = asObject(direct?.data);
	const message = asObject(data?.message);
	const id = asString(direct?.id) ?? asString(message?.id);

	if (!id) {
		return null;
	}

	const offset = asNumber(direct?.offset) ?? asNumber(message?.offset);

	return {
		id,
		...(offset !== undefined ? { offset } : {}),
	};
}

function formatPublishedMessage(message: ReturnType<typeof getPublishedMessage>): string {
	if (!message) {
		return 'Published: acknowledged';
	}

	if (message.offset !== undefined) {
		return `Published: ${message.id} at offset ${message.offset}`;
	}

	return `Published: ${message.id}`;
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

	const msg1 = await ctx.queue.publish(
		queueName,
		{ task: 'process-data', priority: 'normal' },
		{ sync: true }
	);
	const published1 = getPublishedMessage(msg1);
	ctx.logger.info('Published message 1', { id: published1?.id ?? 'acknowledged' });

	const msg2 = await ctx.queue.publish(
		queueName,
		{ task: 'generate-report', priority: 'high' },
		{ sync: true, metadata: { source: 'explorer' } }
	);
	const published2 = getPublishedMessage(msg2);
	ctx.logger.info('Published message 2', { id: published2?.id ?? 'acknowledged' });

	console.log('---OUTPUT---');
	console.log(`Created: "${queue.name}" (${queue.queueType})`);
	console.log(formatPublishedMessage(published1));
	console.log(formatPublishedMessage(published2));
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
