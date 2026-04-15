/**
 * Standalone run script for the Schedules demo
 *
 * Uses ScheduleClient to create a real managed schedule, inspect it,
 * check recent deliveries, and delete it in cleanup.
 *
 * Usage: bun run src/run/schedule.ts '{"expression":"* * * * *"}'
 */
import { ScheduleClient } from '@agentuity/schedule';

const DEFAULT_DESTINATION_URL = 'https://agentuity.dev/api/hello';
const DEFAULT_EXPRESSION = '* * * * *';
const DEFAULT_NAME_PREFIX = 'explorer-demo';
const output: string[] = [];

interface ScheduleInput {
	expression?: string;
	namePrefix?: string;
	destinationUrl?: string;
}

function parseInput(): Required<ScheduleInput> {
	const raw = JSON.parse(process.argv[2] ?? '{}') as ScheduleInput;

	return {
		expression: raw.expression ?? DEFAULT_EXPRESSION,
		namePrefix: raw.namePrefix ?? DEFAULT_NAME_PREFIX,
		destinationUrl: raw.destinationUrl ?? DEFAULT_DESTINATION_URL,
	};
}

const schedules = new ScheduleClient();
let scheduleId: string | undefined;

try {
	const input = parseInput();
	const name = `${input.namePrefix}-${Date.now()}`;

	const { schedule, destinations } = await schedules.create({
		name,
		description: 'SDK Explorer schedules demo',
		expression: input.expression,
		destinations: [
			{
				type: 'url',
				config: {
					url: input.destinationUrl,
					method: 'GET',
				},
			},
		],
	});

	scheduleId = schedule.id;

	const current = await schedules.get(schedule.id);
	const { deliveries } = await schedules.listDeliveries(schedule.id, { limit: 5 });

	output.push(`Created schedule: ${current.schedule.id}`);
	output.push(`Name: ${current.schedule.name}`);
	output.push(`Expression: ${current.schedule.expression}`);
	output.push(`Next run: ${current.schedule.due_date}`);
	output.push(`Destinations: ${destinations.length}`);
	output.push(`Destination URL: ${input.destinationUrl}`);
	output.push(`Deliveries so far: ${deliveries.length}`);
} catch (error) {
	output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (scheduleId) {
		try {
			await schedules.delete(scheduleId);
			output.push(`Deleted schedule: ${scheduleId}`);
		} catch {
			output.push(`Cleanup failed for schedule: ${scheduleId}`);
			process.exitCode = 1;
		}
	}

	console.log('---OUTPUT---');
	console.log(output.join('\n'));
	console.log('---OUTPUT---');
}
