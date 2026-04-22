import { SandboxClient } from '@agentuity/sandbox';

async function main() {
	console.log('=== Sandbox Test App ===\n');

	const client = new SandboxClient();

	try {
		// List available runtimes
		console.log('Listing runtimes...');
		const runtimes = await client.listRuntimes();
		console.log(`  Found ${runtimes.total} runtime(s):`);
		for (const runtime of runtimes.runtimes.slice(0, 5)) {
			console.log(`    - ${runtime.name} (${runtime.id})`);
		}
		console.log();

		// List existing sandboxes
		console.log('Listing sandboxes...');
		const sandboxes = await client.list({ limit: 5 });
		console.log(`  Found ${sandboxes.total} sandbox(es)`);
		console.log();

		// Create a sandbox
		console.log('Creating sandbox...');
		const sandbox = await client.create();
		console.log(`  Created sandbox: ${sandbox.id}`);
		console.log(`  Status: ${sandbox.status}\n`);

		// Execute a command
		console.log('Executing command...');
		const execution = await sandbox.execute({
			command: ['node', '-e', 'console.log("Hello from sandbox!")'],
		});
		console.log(`  Execution ID: ${execution.executionId}`);
		console.log(`  Status: ${execution.status}`);
		console.log(`  Exit Code: ${execution.exitCode}`);
		console.log();

		// Create a job
		console.log('Creating a job...');
		const job = await client.createJob(sandbox.id, {
			command: ['node', '-e', 'let i=0; setInterval(()=>console.log(++i), 1000)'],
		});
		console.log(`  Created job: ${job.id}`);
		console.log(`  Status: ${job.status}\n`);

		// List jobs
		console.log('Listing jobs...');
		const jobs = await client.listJobs(sandbox.id);
		console.log(`  Found ${jobs.jobs.length} job(s):`);
		for (const j of jobs.jobs) {
			console.log(`    - ${j.jobId} (${j.status})`);
		}
		console.log();

		// Stop the job
		console.log('Stopping job...');
		const stoppedJob = await job.stop(true);
		console.log(`  Job ${stoppedJob.jobId} stopped (status: ${stoppedJob.status})\n`);

		// Create a disk checkpoint
		console.log('Creating disk checkpoint...');
		const checkpoint = await client.createDiskCheckpoint(sandbox.id, 'test-checkpoint');
		console.log(`  Created checkpoint: ${checkpoint.id}`);
		console.log(`  Name: ${checkpoint.name}\n`);

		// List checkpoints
		console.log('Listing disk checkpoints...');
		const checkpoints = await client.listDiskCheckpoints(sandbox.id);
		console.log(`  Found ${checkpoints.length} checkpoint(s):`);
		for (const cp of checkpoints) {
			console.log(`    - ${cp.name} (${cp.id})`);
		}
		console.log();

		// Delete the checkpoint
		console.log('Deleting checkpoint...');
		try {
			await checkpoint.delete();
			console.log('  Checkpoint deleted\n');
		} catch (err: unknown) {
			// 409 Conflict - checkpoint can't be deleted while sandbox is running
			// This is expected behavior, so we continue
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('conflict') || message.includes('409')) {
				console.log('  ⚠️  Cannot delete checkpoint while sandbox is running (expected)\n');
			} else {
				throw err;
			}
		}

		// List events
		console.log('Listing events...');
		const events = await client.listEvents(sandbox.id, { limit: 5 });
		console.log(`  Found ${events.events.length} event(s):`);
		for (const event of events.events.slice(0, 3)) {
			console.log(`    - ${event.type} at ${event.createdAt}`);
		}
		console.log();

		// Clean up
		console.log('Destroying sandbox...');
		await sandbox.destroy();
		console.log('  Sandbox destroyed\n');

		console.log('=== Test Complete ===');
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
}

main();
