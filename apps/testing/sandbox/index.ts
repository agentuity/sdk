/**
 * Sandbox Test App
 *
 * A simple standalone Bun app to test the SandboxClient from @agentuity/server.
 * This creates a sandbox, executes a command, and then destroys it.
 */

import { SandboxClient } from '@agentuity/server';

async function main() {
	console.log('🚀 Starting Sandbox Test...\n');

	const client = new SandboxClient();

	console.log('📦 Creating sandbox...');
	const sandbox = await client.create({
		resources: {
			memory: '512Mi',
			cpu: '500m',
		},
	});
	console.log(`✅ Sandbox created: ${sandbox.id}`);
	console.log(`   Status: ${sandbox.status}`);

	console.log('\n📋 Getting sandbox info...');
	const info = await sandbox.get();
	console.log(`   ID: ${info.sandboxId}`);
	console.log(`   Status: ${info.status}`);

	console.log('\n🔧 Executing command: echo "Hello from sandbox!" (piping to stdout)');
	const execution = await sandbox.execute({
		command: ['echo', 'Hello from sandbox!'],
		pipe: {
			stdout: process.stdout,
		},
	});
	console.log(`   Exit code: ${execution.exitCode ?? 'N/A'}`);

	console.log('\n🔧 Executing command: ls -la (piping to stdout)');
	const lsExecution = await sandbox.execute({
		command: ['ls', '-la'],
		pipe: {
			stdout: process.stdout,
		},
	});
	console.log(`   Exit code: ${lsExecution.exitCode ?? 'N/A'}`);

	console.log('\n🔧 Executing command: uname -a (piping to stdout)');
	const unameExecution = await sandbox.execute({
		command: ['uname', '-a'],
		pipe: {
			stdout: process.stdout,
		},
	});
	console.log(`   Exit code: ${unameExecution.exitCode ?? 'N/A'}`);

	console.log('\n🗑️  Destroying sandbox...');
	await sandbox.destroy();
	console.log('✅ Sandbox destroyed');

	console.log('\n✨ Sandbox test completed successfully!');
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
