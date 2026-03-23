/**
 * Email Test App
 *
 * A simple standalone Bun app to test the EmailClient from @agentuity/email.
 * Demonstrates creating email addresses and sending emails.
 */

import { EmailClient } from '@agentuity/email';

async function main() {
	console.log('🚀 Starting Email Test...\n');

	const client = new EmailClient();

	// Generate a unique username to avoid reserved names
	const randomSuffix = Date.now().toString(36);
	const username = `test-${randomSuffix}`;

	// ============================================================
	// Test 1: Create an email address
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Create an email address');
	console.log('═'.repeat(60));

	console.log(`\n📧 Creating email address "${username}"...`);
	const addr = await client.createAddress(username);
	console.log(`   ✅ Address created: ${addr.email}`);
	console.log(`   ID: ${addr.id}`);

	// ============================================================
	// Test 2: Send an email
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 2: Send an email');
	console.log('═'.repeat(60));

	console.log('\n📤 Sending plain text email...');
	await client.send({
		from: addr.email,
		to: ['test-recipient@example.com'],
		subject: 'Hello from Agentuity Email Test',
		text: 'This is a test email sent from the Agentuity Email test app.',
	});
	console.log('   ✅ Email sent');

	// ============================================================
	// Test 3: Send an HTML email
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 3: Send an HTML email');
	console.log('═'.repeat(60));

	console.log('\n📤 Sending HTML email...');
	await client.send({
		from: addr.email,
		to: ['test-recipient@example.com'],
		subject: 'HTML Email from Agentuity',
		html: '<h1>Hello!</h1><p>This is an <strong>HTML email</strong> from the Agentuity test app.</p>',
	});
	console.log('   ✅ HTML email sent');

	// ============================================================
	// Test 4: Send email with multiple recipients
	// ============================================================
	console.log(`\n${'═'.repeat(60)}`);
	console.log('Test 4: Send email with multiple recipients');
	console.log('═'.repeat(60));

	console.log('\n📤 Sending email to multiple recipients...');
	await client.send({
		from: addr.email,
		to: ['user1@example.com', 'user2@example.com'],
		subject: 'Team Notification',
		text: 'This email was sent to multiple recipients as a test.',
	});
	console.log('   ✅ Multi-recipient email sent');

	console.log(`\n${'═'.repeat(60)}`);
	console.log('✨ Email test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
