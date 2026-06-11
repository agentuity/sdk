/**
 * Standalone run script for the Schedules demo
 *
 * Creates a real managed schedule, exercises the schedule client lifecycle,
 * then deletes the temporary destination and schedule.
 *
 * Usage: bun run src/run/schedule.ts '{"expression":"* * * * *"}'
 */
import { ScheduleClient } from '@agentuity/schedule';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

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
let destinationId: string | undefined;

try {
	const input = parseInput();
	const name = `${input.namePrefix}-${Date.now()}`;

	// Use a caller-provided destination so the demo does not assume one framework.
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

	const extraDestination = await schedules.createDestination(schedule.id, {
		type: 'url',
		config: {
			url: input.destinationUrl,
			method: 'POST',
			headers: {
				'x-demo': 'sdk-explorer',
			},
		},
	});
	destinationId = extraDestination.destination.id;

	const fetched = await schedules.get(schedule.id);
	const listed = await schedules.list({ limit: 25 });
	const deliveryHistory = await schedules.listDeliveries(schedule.id, { limit: 10 });
	const updated = await schedules.update(schedule.id, {
		description: 'SDK Explorer schedules demo, updated',
	});

	output.push(`Created schedule: ${schedule.id}`);
	output.push(`Name: ${schedule.name}`);
	output.push(`Expression: ${updated.schedule.expression}`);
	output.push(`Next run: ${updated.schedule.due_date}`);
	output.push(`Destinations from create: ${destinations.length}`);
	output.push(`Destinations after add: ${fetched.destinations.length}`);
	output.push(
		`Listed: ${listed.schedules.some((item) => item.id === schedule.id) ? 'yes' : 'no'}`
	);
	output.push(`Deliveries: ${deliveryHistory.deliveries.length}`);
	output.push(`Destination URL: ${input.destinationUrl}`);
} catch (error) {
	output.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (destinationId) {
		try {
			await schedules.deleteDestination(destinationId);
			output.push(`Deleted destination: ${destinationId}`);
		} catch {
			output.push(`Cleanup failed for destination: ${destinationId}`);
			process.exitCode = 1;
		}
	}

	if (scheduleId) {
		try {
			await schedules.delete(scheduleId);
			output.push(`Deleted schedule: ${scheduleId}`);
		} catch {
			output.push(`Cleanup failed for schedule: ${scheduleId}`);
			process.exitCode = 1;
		}
	}

	writeSandboxOutput(output.join('\n'));
}
