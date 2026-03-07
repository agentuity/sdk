/**
 * Sandbox Service Tests
 *
 * Single test that exercises the full sandbox lifecycle sequentially.
 * Tests run concurrently in batches so shared module state is unreliable.
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertTruthy } from './helpers';

import sandboxAgent from '@agents/sandbox/basic';

type AgentResult = Awaited<ReturnType<typeof sandboxAgent.run>>;

/**
 * Assert agent call succeeded. On failure, throws an error with structured
 * diagnostic fields (statusCode, method, url, sessionId) so the test suite's
 * extractDiagnostics can surface them in CI output.
 */
function assertSuccess(result: AgentResult, label: string): void {
	if (result.success) return;
	const err = new Error(`Assertion failed: ${label}: ${result.error}`);
	const diagnostics: Record<string, unknown> = {};
	if (result.statusCode != null) diagnostics.statusCode = result.statusCode;
	if (result.errorMethod) diagnostics.method = result.errorMethod;
	if (result.errorUrl) diagnostics.url = result.errorUrl;
	if (result.sessionId) diagnostics.sessionId = result.sessionId;
	if (result.errorTag) diagnostics.errorType = result.errorTag;
	Object.assign(err, diagnostics);
	throw err;
}

test('sandbox', 'lifecycle', async () => {
	// Create
	const create = await sandboxAgent.run({ operation: 'create' });
	assertSuccess(create, 'Create');
	assertDefined(create.sandboxId, 'Sandbox ID should be defined');
	const id = create.sandboxId!;

	// Get info
	const get = await sandboxAgent.run({ operation: 'get', sandboxId: id });
	assertSuccess(get, 'Get');
	assertEqual(get.info!.sandboxId, id);

	// Connect
	const conn = await sandboxAgent.run({ operation: 'connect', sandboxId: id });
	assertSuccess(conn, 'Connect');
	assertEqual(conn.sandboxId, id);

	// Execute
	const exec = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: id,
		command: ['echo', 'hello'],
	});
	assertSuccess(exec, 'Execute');
	assertEqual(exec.exitCode, 0, `Exit code: ${exec.exitCode}`);

	// Write + read file
	const write = await sandboxAgent.run({
		operation: 'write-file',
		sandboxId: id,
		filePath: 'test.txt',
		fileContent: 'hello',
	});
	assertSuccess(write, 'WriteFile');

	const read = await sandboxAgent.run({
		operation: 'read-file',
		sandboxId: id,
		filePath: 'test.txt',
	});
	assertSuccess(read, 'ReadFile');
	assertEqual(read.fileContent, 'hello', `Content: ${read.fileContent}`);

	// List files
	const list = await sandboxAgent.run({ operation: 'list-files', sandboxId: id });
	assertSuccess(list, 'ListFiles');
	assert(list.files!.length > 0, 'Should have files');

	// Mkdir
	const mkdir = await sandboxAgent.run({
		operation: 'mkdir',
		sandboxId: id,
		dirPath: 'sub/nested',
		recursive: true,
	});
	assertSuccess(mkdir, 'Mkdir');

	// Set env + verify in execution
	const env = await sandboxAgent.run({
		operation: 'set-env',
		sandboxId: id,
		env: { MY_VAR: 'val' },
	});
	assertSuccess(env, 'SetEnv');
	assertEqual(env.env!.MY_VAR, 'val');

	const printenv = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: id,
		command: ['printenv', 'MY_VAR'],
	});
	assertSuccess(printenv, 'Printenv');
	assertEqual(printenv.exitCode, 0, `Printenv exit: ${printenv.exitCode}`);

	// Remove file + dir
	const rmf = await sandboxAgent.run({
		operation: 'rmfile',
		sandboxId: id,
		filePath: 'test.txt',
	});
	assertSuccess(rmf, 'Rmfile');

	const rmd = await sandboxAgent.run({
		operation: 'rmdir',
		sandboxId: id,
		dirPath: 'sub',
		recursive: true,
	});
	assertSuccess(rmd, 'Rmdir');

	// Pause + resume
	const pause = await sandboxAgent.run({ operation: 'pause', sandboxId: id });
	assertSuccess(pause, 'Pause');

	const afterPause = await sandboxAgent.run({ operation: 'get', sandboxId: id });
	assertSuccess(afterPause, 'GetAfterPause');
	assertTruthy(
		afterPause.info?.status === 'paused' || afterPause.info?.status === 'suspended',
		`Should be paused, got: ${afterPause.info?.status}`
	);

	const resume = await sandboxAgent.run({ operation: 'resume', sandboxId: id });
	assertSuccess(resume, 'Resume');

	// Run (one-shot, independent sandbox)
	const run = await sandboxAgent.run({ operation: 'run', command: ['echo', 'oneshot'] });
	assertSuccess(run, 'Run');
	assertEqual(run.exitCode, 0, `Run exit: ${run.exitCode}`);

	// Destroy
	const destroy = await sandboxAgent.run({ operation: 'destroy', sandboxId: id });
	assertSuccess(destroy, 'Destroy');
});
