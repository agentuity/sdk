/**
 * Schedule Test App
 *
 * A simple standalone Bun app to test the ScheduleClient from @agentuity/schedule.
 * Demonstrates creating and managing cron-based scheduled jobs.
 */

import { ScheduleClient } from '@agentuity/schedule';

async function main() {
	console.log('🚀 Starting Schedule Test...\n');

	const client = new ScheduleClient();

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
	console.log(`   ✅ Schedule created: ${schedule3.id}`);
	console.log(`   Name: ${schedule3.name}`);
	console.log(`   Expression: ${schedule3.expression}`);

	console.log('\n' + '═'.repeat(60));
	console.log('✨ Schedule test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
