/**
 * Webhook Test App
 *
 * A simple standalone Bun app to test the WebhookClient from @agentuity/webhook.
 * Demonstrates creating webhooks and adding destinations.
 */

import { WebhookClient } from '@agentuity/webhook';

async function main() {
	console.log('🚀 Starting Webhook Test...\n');

	const client = new WebhookClient();

	// ============================================================
	// Test 1: Create a webhook
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Create a webhook');
	console.log('═'.repeat(60));

	console.log('\n🔗 Creating webhook "GitHub Events"...');
	const { webhook: webhook1 } = await client.create({ name: 'GitHub Events' });
	console.log(`   ✅ Webhook created: ${webhook1.id}`);
	console.log(`   Name: ${webhook1.name}`);
	console.log(`   URL: ${webhook1.url}`);

	// ============================================================
	// Test 2: Add a destination to the webhook
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 2: Add a destination to the webhook');
	console.log('═'.repeat(60));

	console.log('\n📌 Adding URL destination...');
	await client.createDestination(webhook1.id, {
		type: 'url',
		config: { url: 'https://example.com/webhook-handler' },
	});
	console.log('   ✅ Destination added');

	// ============================================================
	// Test 3: Create another webhook with a destination
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 3: Create another webhook');
	console.log('═'.repeat(60));

	console.log('\n🔗 Creating webhook "Stripe Events"...');
	const { webhook: webhook2 } = await client.create({ name: 'Stripe Events' });
	console.log(`   ✅ Webhook created: ${webhook2.id}`);
	console.log(`   Name: ${webhook2.name}`);
	console.log(`   URL: ${webhook2.url}`);

	console.log('\n📌 Adding URL destination...');
	await client.createDestination(webhook2.id, {
		type: 'url',
		config: { url: 'https://example.com/stripe-handler' },
	});
	console.log('   ✅ Destination added');

	// ============================================================
	// Test 4: Create a webhook for monitoring
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 4: Create a monitoring webhook');
	console.log('═'.repeat(60));

	console.log('\n🔗 Creating webhook "Alert Notifications"...');
	const { webhook: webhook3 } = await client.create({ name: 'Alert Notifications' });
	console.log(`   ✅ Webhook created: ${webhook3.id}`);
	console.log(`   Name: ${webhook3.name}`);
	console.log(`   URL: ${webhook3.url}`);

	console.log('\n📌 Adding multiple destinations...');
	await client.createDestination(webhook3.id, {
		type: 'url',
		config: { url: 'https://example.com/alerts' },
	});
	console.log('   ✅ Destination 1 added');

	await client.createDestination(webhook3.id, {
		type: 'url',
		config: { url: 'https://example.com/alerts-backup' },
	});
	console.log('   ✅ Destination 2 added');

	console.log('\n' + '═'.repeat(60));
	console.log('✨ Webhook test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
