/**
 * Sandbox Test App
 *
 * A simple standalone Bun app to test the SandboxClient from @agentuity/server.
 * This demonstrates different output handling patterns:
 * 1. Interactive sandbox with piped output
 * 2. One-shot run() with automatic output capture
 * 3. One-shot run() with custom streams AND capture
 */

import { Writable } from 'node:stream';
import { SandboxClient } from '@agentuity/server';

async function main() {
	console.log('🚀 Starting Sandbox Test...\n');

	const client = new SandboxClient();

	// ============================================================
	// Test 1: Interactive sandbox with piped output
	// ============================================================
	console.log('═'.repeat(60));
	console.log('Test 1: Interactive sandbox with piped output');
	console.log('═'.repeat(60));

	console.log('\n📦 Creating sandbox...');
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

	// ============================================================
	// Test 2: One-shot run() with automatic output capture
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 2: One-shot run() with automatic output capture');
	console.log('═'.repeat(60));

	console.log('\n🔧 Running: echo "Hello from one-shot sandbox!"');
	const runResult1 = await client.run({
		command: { exec: ['echo', 'Hello from one-shot sandbox!'] },
	});
	console.log(`   Sandbox ID: ${runResult1.sandboxId}`);
	console.log(`   Exit code: ${runResult1.exitCode}`);
	console.log(`   Duration: ${runResult1.durationMs}ms`);
	console.log(`   Captured stdout: "${runResult1.stdout?.trim()}"`);
	console.log(`   Captured stderr: "${runResult1.stderr?.trim()}"`);

	console.log('\n🔧 Running: ls -la /home');
	const runResult2 = await client.run({
		command: { exec: ['ls', '-la', '/home'] },
	});
	console.log(`   Exit code: ${runResult2.exitCode}`);
	console.log(`   Captured stdout (${runResult2.stdout?.length ?? 0} chars):`);
	console.log(
		runResult2.stdout
			?.split('\n')
			.map((l) => `      ${l}`)
			.join('\n')
	);

	console.log('\n🔧 Running: command that writes to stderr');
	const runResult3 = await client.run({
		command: { exec: ['sh', '-c', 'echo "stdout message" && echo "stderr message" >&2'] },
	});
	console.log(`   Exit code: ${runResult3.exitCode}`);
	console.log(`   Captured stdout: "${runResult3.stdout?.trim()}"`);
	console.log(`   Captured stderr: "${runResult3.stderr?.trim()}"`);

	// ============================================================
	// Test 3: One-shot run() with custom streams AND capture
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 3: One-shot run() with custom streams AND capture');
	console.log('═'.repeat(60));

	// Create a custom writable that collects output
	const customChunks: string[] = [];
	const customStream = new Writable({
		write(chunk, _encoding, callback) {
			const text = chunk.toString();
			customChunks.push(text);
			// Also write to console with prefix
			process.stdout.write(`   [STREAM] ${text}`);
			callback();
		},
	});

	console.log('\n🔧 Running with custom stdout stream: echo "Testing tee output"');
	const runResult4 = await client.run(
		{
			command: { exec: ['echo', 'Testing tee output'] },
		},
		{
			stdout: customStream,
			stderr: process.stderr,
		}
	);
	console.log(`   Exit code: ${runResult4.exitCode}`);
	console.log(`   Custom stream received: "${customChunks.join('').trim()}"`);
	console.log(`   Result also captured: "${runResult4.stdout?.trim()}"`);
	console.log(`   ✅ Both match: ${customChunks.join('').trim() === runResult4.stdout?.trim()}`);

	// ============================================================
	// Test 4: One-shot run() with failing command
	// ============================================================
	console.log('\n' + '═'.repeat(60));
	console.log('Test 4: One-shot run() with failing command');
	console.log('═'.repeat(60));

	console.log('\n🔧 Running: exit 42');
	const runResult5 = await client.run({
		command: { exec: ['sh', '-c', 'echo "About to fail" && exit 42'] },
	});
	console.log(`   Exit code: ${runResult5.exitCode}`);
	console.log(`   Captured stdout: "${runResult5.stdout?.trim()}"`);
	console.log(`   ✅ Exit code is 42: ${runResult5.exitCode === 42}`);

	console.log('\n' + '═'.repeat(60));
	console.log('✨ All sandbox tests completed successfully!');
	console.log('═'.repeat(60));
}

main().catch((error) => {
	console.error('❌ Error:', error.message);
	process.exit(1);
});
