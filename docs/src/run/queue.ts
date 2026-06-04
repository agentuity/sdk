/**
 * Standalone run script for Queue demo
 *
 * Shows the service-client publishing path: create a worker queue, publish
 * messages, then delete the demo queue. The live API route covers receive,
 * ack, nack, and dead-letter behavior.
 *
 * Usage: bun run src/run/queue.ts '{}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

const ctx = getDemoContext();
const output: string[] = [];

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
	ctx.logger.info('Creating queue', { name: queueName });
	const queue = await ctx.queue.createQueue(queueName, {
		queueType: 'worker',
		settings: {
			defaultMaxRetries: 2,
			defaultVisibilityTimeoutSeconds: 5,
		},
	});
	ctx.logger.info('Queue created', { name: queue.name, type: queue.queueType });

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

	output.push(`Created: "${queue.name}" (${queue.queueType})`);
	output.push(formatPublishedMessage('process-data', firstOffset));
	output.push(formatPublishedMessage('generate-report', secondOffset));
} catch (error) {
	output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	// Queues are real resources, so cleanup runs even when publish fails.
	try {
		ctx.logger.info('Deleting queue');
		await ctx.queue.deleteQueue(queueName);
		ctx.logger.info('Queue deleted');
		output.push(`Deleted: "${queueName}"`);
	} catch {
		ctx.logger.warn('Failed to delete queue during cleanup', { name: queueName });
		output.push(`Cleanup failed: could not delete "${queueName}"`);
		process.exitCode = 1;
	}

	writeSandboxOutput(output.join('\n'));
}
