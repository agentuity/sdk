/**
 * Sandbox Service Tests
 *
 * Single test that exercises the full sandbox lifecycle sequentially.
 * Tests run concurrently in batches so shared module state is unreliable.
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertTruthy } from './helpers';

import sandboxAgent from '@agents/sandbox/basic';

test('sandbox', 'lifecycle', async () => {
	// Create
	const create = await sandboxAgent.run({ operation: 'create' });
	assertEqual(create.success, true, `Create: ${create.error}`);
	assertDefined(create.sandboxId, 'Sandbox ID should be defined');
	const id = create.sandboxId!;

	// Get info
	const get = await sandboxAgent.run({ operation: 'get', sandboxId: id });
	assertEqual(get.success, true, `Get: ${get.error}`);
	assertEqual(get.info!.sandboxId, id);

	// Connect
	const conn = await sandboxAgent.run({ operation: 'connect', sandboxId: id });
	assertEqual(conn.success, true, `Connect: ${conn.error}`);
	assertEqual(conn.sandboxId, id);

	// Execute
	const exec = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: id,
		command: ['echo', 'hello'],
	});
	assertEqual(exec.success, true, `Execute: ${exec.error}`);
	assertEqual(exec.exitCode, 0, `Exit code: ${exec.exitCode}`);

	// Write + read file
	await sandboxAgent.run({
		operation: 'write-file',
		sandboxId: id,
		filePath: 'test.txt',
		fileContent: 'hello',
	});
	const read = await sandboxAgent.run({
		operation: 'read-file',
		sandboxId: id,
		filePath: 'test.txt',
	});
	assertEqual(read.success, true, `Read: ${read.error}`);
	assertEqual(read.fileContent, 'hello', `Content: ${read.fileContent}`);

	// List files
	const list = await sandboxAgent.run({ operation: 'list-files', sandboxId: id });
	assertEqual(list.success, true, `List: ${list.error}`);
	assert(list.files!.length > 0, 'Should have files');

	// Mkdir
	const mkdir = await sandboxAgent.run({
		operation: 'mkdir',
		sandboxId: id,
		dirPath: 'sub/nested',
		recursive: true,
	});
	assertEqual(mkdir.success, true, `Mkdir: ${mkdir.error}`);

	// Set env + verify in execution
	const env = await sandboxAgent.run({
		operation: 'set-env',
		sandboxId: id,
		env: { MY_VAR: 'val' },
	});
	assertEqual(env.success, true, `SetEnv: ${env.error}`);
	assertEqual(env.env!.MY_VAR, 'val');

	const printenv = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: id,
		command: ['printenv', 'MY_VAR'],
	});
	assertEqual(printenv.success, true, `Printenv: ${printenv.error}`);
	assertEqual(printenv.exitCode, 0, `Printenv exit: ${printenv.exitCode}`);

	// Remove file + dir
	const rmf = await sandboxAgent.run({
		operation: 'rmfile',
		sandboxId: id,
		filePath: 'test.txt',
	});
	assertEqual(rmf.success, true, `Rmfile: ${rmf.error}`);

	const rmd = await sandboxAgent.run({
		operation: 'rmdir',
		sandboxId: id,
		dirPath: 'sub',
		recursive: true,
	});
	assertEqual(rmd.success, true, `Rmdir: ${rmd.error}`);

	// Pause + resume
	const pause = await sandboxAgent.run({ operation: 'pause', sandboxId: id });
	assertEqual(pause.success, true, `Pause: ${pause.error}`);

	const afterPause = await sandboxAgent.run({ operation: 'get', sandboxId: id });
	assertTruthy(
		afterPause.info?.status === 'paused' || afterPause.info?.status === 'suspended',
		`Should be paused, got: ${afterPause.info?.status}`
	);

	const resume = await sandboxAgent.run({ operation: 'resume', sandboxId: id });
	assertEqual(resume.success, true, `Resume: ${resume.error}`);

	// Run (one-shot, independent sandbox)
	const run = await sandboxAgent.run({ operation: 'run', command: ['echo', 'oneshot'] });
	assertEqual(run.success, true, `Run: ${run.error}`);
	assertEqual(run.exitCode, 0, `Run exit: ${run.exitCode}`);

	// Destroy
	const destroy = await sandboxAgent.run({ operation: 'destroy', sandboxId: id });
	assertEqual(destroy.success, true, `Destroy: ${destroy.error}`);
});
