/**
 * Task Test App
 *
 * A simple standalone Bun app to test the TaskClient from @agentuity/task.
 * Demonstrates creating tasks, adding comments, and managing task lifecycle.
 */

import { TaskClient } from '@agentuity/task';

async function main() {
	console.log('🚀 Starting Task Test...\n');

	const client = new TaskClient();

	// ============================================================
	// Test 1: Create a high-priority task
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Create a high-priority task');
	console.log('═'.repeat(60));

	console.log('\n📝 Creating task...');
	const task1 = await client.create({
		title: 'Implement user authentication',
		type: 'task',
		created_id: process.env.AGENTUITY_USER_ID || 'test-user',
		description: 'Add JWT-based authentication to the API endpoints',
		priority: 'high',
	});
	console.log(`   ✅ Task created: ${task1.id}`);
	console.log(`   Title: ${task1.title}`);
	console.log(`   Priority: ${task1.priority}`);

	// ============================================================
	// Test 2: Add comments to the task
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 2: Add comments to the task');
	console.log('═'.repeat(60));

	console.log('\n💬 Adding comment 1...');
	await client.createComment(
		task1.id,
		'Started working on the auth middleware',
		process.env.AGENTUITY_USER_ID || 'test-user'
	);
	console.log('   ✅ Comment added');

	console.log('\n💬 Adding comment 2...');
	await client.createComment(
		task1.id,
		'JWT token validation is working, moving to refresh tokens',
		process.env.AGENTUITY_USER_ID || 'test-user'
	);
	console.log('   ✅ Comment added');

	// ============================================================
	// Test 3: Create a medium-priority task
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 3: Create a medium-priority task');
	console.log('═'.repeat(60));

	console.log('\n📝 Creating task...');
	const task2 = await client.create({
		title: 'Write API documentation',
		type: 'task',
		created_id: process.env.AGENTUITY_USER_ID || 'test-user',
		description: 'Document all REST endpoints with examples',
		priority: 'medium',
	});
	console.log(`   ✅ Task created: ${task2.id}`);
	console.log(`   Title: ${task2.title}`);
	console.log(`   Priority: ${task2.priority}`);

	// ============================================================
	// Test 4: Create a low-priority task
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 4: Create a low-priority task');
	console.log('═'.repeat(60));

	console.log('\n📝 Creating task...');
	const task3 = await client.create({
		title: 'Update README badges',
		type: 'task',
		created_id: process.env.AGENTUITY_USER_ID || 'test-user',
		description: 'Add CI/CD status badges to the project README',
		priority: 'low',
	});
	console.log(`   ✅ Task created: ${task3.id}`);
	console.log(`   Title: ${task3.title}`);
	console.log(`   Priority: ${task3.priority}`);

	console.log('\n' + '═'.repeat(60));
	console.log('✨ Task test completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
