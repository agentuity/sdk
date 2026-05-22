/**
 * Schedule Test App
 *
 * A simple standalone Bun app to test the ScheduleClient from @agentuity/schedule.
 * Demonstrates creating and managing cron-based scheduled jobs.
 */

import { ScheduleClient } from '@agentuity/schedule';
import { isStructuredError } from '@agentuity/core';

async function main() {
	console.log('🚀 Starting Schedule Test...\n');

	const client = new ScheduleClient();
	const scheduleIds: string[] = [];

	try {
		// ============================================================
		// Test 1: Create a schedule (every hour)
		// ============================================================
		console.log('═'.repeat(60));
		console.log('Test 1: Create an hourly schedule');
		console.log('═'.repeat(60));

		console.log('\n⏰ Creating hourly schedule...');
		const { schedule: schedule1 } = await client.create({
			name: 'Hourly Data Sync',
			expression: '0 * * * *',
			destinations: [
				{
					type: 'url',
					config: { url: 'https://example.com/sync' },
				},
			],
		});
		scheduleIds.push(schedule1.id);
		console.log(`   ✅ Schedule created: ${schedule1.id}`);
		console.log(`   Name: ${schedule1.name}`);
		console.log(`   Expression: ${schedule1.expression}`);

		// ============================================================
		// Test 2: Create a schedule (daily at midnight)
		// ============================================================
		console.log('\n' + '═'.repeat(60));
		console.log('Test 2: Create a daily schedule');
		console.log('═'.repeat(60));

		console.log('\n⏰ Creating daily schedule...');
		const { schedule: schedule2 } = await client.create({
			name: 'Daily Report Generation',
			expression: '0 0 * * *',
			destinations: [
				{
					type: 'url',
					config: { url: 'https://example.com/generate-report' },
				},
			],
		});
		scheduleIds.push(schedule2.id);
		console.log(`   ✅ Schedule created: ${schedule2.id}`);
		console.log(`   Name: ${schedule2.name}`);
		console.log(`   Expression: ${schedule2.expression}`);

		// ============================================================
		// Test 3: Create a schedule (every 5 minutes)
		// ============================================================
		console.log('\n' + '═'.repeat(60));
		console.log('Test 3: Create a frequent schedule');
		console.log('═'.repeat(60));

		console.log('\n⏰ Creating every-5-minutes schedule...');
		const { schedule: schedule3 } = await client.create({
			name: 'Health Check',
			expression: '*/5 * * * *',
			destinations: [
				{
					type: 'url',
					config: { url: 'https://example.com/health' },
				},
			],
		});
		scheduleIds.push(schedule3.id);
		console.log(`   ✅ Schedule created: ${schedule3.id}`);
		console.log(`   Name: ${schedule3.name}`);
		console.log(`   Expression: ${schedule3.expression}`);

		console.log('\n' + '═'.repeat(60));
		console.log('✨ Schedule test completed successfully!');
		console.log('═'.repeat(60));
	} finally {
		// Cleanup: delete all created schedules
		if (scheduleIds.length > 0) {
			console.log('\n🗑️  Cleaning up...');
			for (const id of scheduleIds) {
				try {
					await client.delete(id);
					console.log(`   ✅ Deleted schedule ${id}`);
				} catch {
					console.log(`   ⚠️  Could not delete schedule ${id}`);
				}
			}
		}
	}
}

main().catch((error: unknown) => {
	if (isStructuredError(error)) {
		console.error('❌ Error:', error.message);
		console.error('   Code:', error._tag);
	} else if (error instanceof Error) {
		console.error('❌ Error:', error.message);
	} else {
		console.error('❌ Error:', String(error));
	}
	process.exit(1);
});
