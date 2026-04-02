/**
 * Standalone run script for Schedule demo
 *
 * Shows the agent-side schedule API: create schedule with destination,
 * list schedules, get details, and delete.
 *
 * Usage: bun run src/run/schedule.ts '{}'
 */
import { createAgentContext } from '@agentuity/runtime';

const ctx = createAgentContext();

const scheduleName = `explorer-sandbox-${Date.now().toString(36)}`;
let scheduleId: string | null = null;

try {
	// CREATE schedule with a URL destination
	ctx.logger.info('Creating schedule', { name: scheduleName });
	const { schedule, destinations } = await ctx.schedule.create({
		name: scheduleName,
		expression: '0 * * * *',
		destinations: [{ type: 'url', config: { url: 'https://api.example.com/sync' } }],
	});
	scheduleId = schedule.id;
	ctx.logger.info('Schedule created', { id: schedule.id, expression: schedule.expression });

	// LIST schedules
	ctx.logger.info('Listing schedules');
	const { schedules, total } = await ctx.schedule.list({ limit: 10 });
	ctx.logger.info('Listed schedules', { total });

	// GET schedule with destinations
	ctx.logger.info('Getting schedule details', { id: schedule.id });
	const details = await ctx.schedule.get(schedule.id);
	ctx.logger.info('Got details', {
		name: details.schedule.name,
		destinations: details.destinations.length,
	});

	console.log('---OUTPUT---');
	console.log('=== Schedules Demo ===');
	console.log('');
	console.log(`Created: "${schedule.name}" (${schedule.expression})`);
	console.log(`  ID: ${schedule.id}`);
	console.log(`  Next due: ${schedule.due_date}`);
	if (destinations[0]) {
		console.log(`  Destination: ${destinations[0].id} (${destinations[0].type})`);
	}
	console.log('');
	console.log(`Listed: ${total} schedule(s)`);
	console.log('');
	console.log(`Details for ${details.schedule.id}:`);
	console.log(`  Name: ${details.schedule.name}`);
	console.log(`  Expression: ${details.schedule.expression}`);
	console.log(`  Destinations: ${details.destinations.length}`);
	for (const dest of details.destinations) {
		console.log(`    → ${dest.type}: ${JSON.stringify(dest.config)}`);
	}
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	if (scheduleId) {
		try {
			ctx.logger.info('Deleting schedule', { id: scheduleId });
			await ctx.schedule.delete(scheduleId);
			ctx.logger.info('Schedule deleted');
			console.log('');
			console.log(`Deleted: "${scheduleName}" (${scheduleId})`);
		} catch {
			ctx.logger.warn('Failed to delete schedule during cleanup', { id: scheduleId });
			console.log(`Cleanup failed: could not delete "${scheduleName}"`);
		}
	}
}
