/**
 * Sandbox Service Tests
 *
 * Tests sandbox lifecycle, file operations, and execution via ctx.sandbox.
 * Each test uses a shared sandbox to minimize resource usage.
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertTruthy } from './helpers';

import sandboxAgent from '@agents/sandbox/basic';

// Shared sandbox ID — created in the first test, cleaned up in the last
let sharedSandboxId: string | undefined;

// Test: Create a sandbox
test('sandbox', 'create', async () => {
	const result = await sandboxAgent.run({ operation: 'create' });

	assertDefined(result, 'Result should be defined');
	assertEqual(result.success, true, `Create should succeed: ${result.error}`);
	assertDefined(result.sandboxId, 'Sandbox ID should be defined');
	assertDefined(result.status, 'Status should be defined');

	// Store for subsequent tests
	sharedSandboxId = result.sandboxId;
});

// Test: Get sandbox info
test('sandbox', 'get-info', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'get',
		sandboxId: sharedSandboxId,
	});

	assertEqual(result.success, true, `Get should succeed: ${result.error}`);
	assertDefined(result.info, 'Info should be defined');
	assertEqual(result.info!.sandboxId, sharedSandboxId!);
	assertDefined(result.info!.status, 'Info status should be defined');
});

// Test: Connect to an existing sandbox by ID
test('sandbox', 'connect', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'connect',
		sandboxId: sharedSandboxId,
	});

	assertEqual(result.success, true, `Connect should succeed: ${result.error}`);
	assertEqual(result.sandboxId, sharedSandboxId!);
	assertDefined(result.status, 'Connected sandbox should have status');
});

// Test: Execute a command in the sandbox
test('sandbox', 'execute', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: sharedSandboxId,
		command: ['echo', 'hello world'],
	});

	assertEqual(result.success, true, `Execute should succeed: ${result.error}`);
	assertDefined(result.executionId, 'Execution ID should be defined');
	assertEqual(result.exitCode, 0, `Exit code should be 0, got ${result.exitCode}`);
});

// Test: Write a file to the sandbox
test('sandbox', 'write-file', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'write-file',
		sandboxId: sharedSandboxId,
		filePath: 'test-file.txt',
		fileContent: 'hello from integration test',
	});

	assertEqual(result.success, true, `Write file should succeed: ${result.error}`);
});

// Test: Read a file from the sandbox
test('sandbox', 'read-file', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'read-file',
		sandboxId: sharedSandboxId,
		filePath: 'test-file.txt',
	});

	assertEqual(result.success, true, `Read file should succeed: ${result.error}`);
	assertEqual(
		result.fileContent,
		'hello from integration test',
		`File content should match, got: ${result.fileContent}`
	);
});

// Test: List files in the sandbox
test('sandbox', 'list-files', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'list-files',
		sandboxId: sharedSandboxId,
	});

	assertEqual(result.success, true, `List files should succeed: ${result.error}`);
	assertDefined(result.files, 'Files should be defined');
	assert(result.files!.length > 0, 'Should have at least one file');

	const testFile = result.files!.find((f) => f.path === 'test-file.txt');
	assertDefined(testFile, 'test-file.txt should be in the listing');
	assertEqual(testFile!.isDir, false, 'test-file.txt should not be a directory');
});

// Test: Create a directory in the sandbox
test('sandbox', 'mkdir', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'mkdir',
		sandboxId: sharedSandboxId,
		dirPath: 'test-dir/nested',
		recursive: true,
	});

	assertEqual(result.success, true, `mkdir should succeed: ${result.error}`);

	// Verify directory exists via list
	const listResult = await sandboxAgent.run({
		operation: 'list-files',
		sandboxId: sharedSandboxId,
	});

	assertEqual(listResult.success, true, `List after mkdir should succeed: ${listResult.error}`);
	const dir = listResult.files!.find((f) => f.path === 'test-dir');
	assertDefined(dir, 'test-dir should be in the listing');
	assertEqual(dir!.isDir, true, 'test-dir should be a directory');
});

// Test: Set environment variables on the sandbox
test('sandbox', 'set-env', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'set-env',
		sandboxId: sharedSandboxId,
		env: { TEST_VAR: 'test-value', ANOTHER_VAR: 'another-value' },
	});

	assertEqual(result.success, true, `Set env should succeed: ${result.error}`);
	assertDefined(result.env, 'Env should be returned');
	assertEqual(result.env!.TEST_VAR, 'test-value');
	assertEqual(result.env!.ANOTHER_VAR, 'another-value');
});

// Test: Verify env vars are available in execution
test('sandbox', 'env-in-execution', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'execute',
		sandboxId: sharedSandboxId,
		command: ['printenv', 'TEST_VAR'],
	});

	assertEqual(result.success, true, `Execute printenv should succeed: ${result.error}`);
	assertEqual(result.exitCode, 0, `Exit code should be 0, got ${result.exitCode}`);
});

// Test: Remove a file from the sandbox
test('sandbox', 'rmfile', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'rmfile',
		sandboxId: sharedSandboxId,
		filePath: 'test-file.txt',
	});

	assertEqual(result.success, true, `rmfile should succeed: ${result.error}`);

	// Verify file is gone via list
	const listResult = await sandboxAgent.run({
		operation: 'list-files',
		sandboxId: sharedSandboxId,
	});

	assertEqual(listResult.success, true, `List after rmfile should succeed: ${listResult.error}`);
	const file = listResult.files!.find((f) => f.path === 'test-file.txt');
	assert(!file, 'test-file.txt should not be in listing after removal');
});

// Test: Remove a directory from the sandbox
test('sandbox', 'rmdir', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'rmdir',
		sandboxId: sharedSandboxId,
		dirPath: 'test-dir',
		recursive: true,
	});

	assertEqual(result.success, true, `rmdir should succeed: ${result.error}`);
});

// Test: One-shot run (create → execute → destroy in one call)
test('sandbox', 'run-oneshot', async () => {
	const result = await sandboxAgent.run({
		operation: 'run',
		command: ['echo', 'one-shot'],
	});

	assertEqual(result.success, true, `Run should succeed: ${result.error}`);
	assertDefined(result.sandboxId, 'Run should return sandbox ID');
	assertEqual(result.exitCode, 0, `Exit code should be 0, got ${result.exitCode}`);
});

// Test: Pause and resume the shared sandbox
test('sandbox', 'pause-resume', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');

	// Pause
	const pauseResult = await sandboxAgent.run({ operation: 'pause', sandboxId: sharedSandboxId });
	assertEqual(pauseResult.success, true, `Pause should succeed: ${pauseResult.error}`);

	// Verify paused status
	const getResult = await sandboxAgent.run({ operation: 'get', sandboxId: sharedSandboxId });
	assertEqual(getResult.success, true, `Get after pause: ${getResult.error}`);
	assertTruthy(
		getResult.info?.status === 'paused' || getResult.info?.status === 'suspended',
		`Sandbox should be paused, got: ${getResult.info?.status}`
	);

	// Resume
	const resumeResult = await sandboxAgent.run({
		operation: 'resume',
		sandboxId: sharedSandboxId,
	});
	assertEqual(resumeResult.success, true, `Resume should succeed: ${resumeResult.error}`);
});

// Test: Destroy the shared sandbox (cleanup — run last)
test('sandbox', 'destroy', async () => {
	assertDefined(sharedSandboxId, 'Shared sandbox should exist');
	const result = await sandboxAgent.run({
		operation: 'destroy',
		sandboxId: sharedSandboxId,
	});

	assertEqual(result.success, true, `Destroy should succeed: ${result.error}`);

	// Verify it's gone
	const getResult = await sandboxAgent.run({
		operation: 'get',
		sandboxId: sharedSandboxId,
	});

	// Getting a destroyed sandbox should either fail or return deleted status
	assertTruthy(
		!getResult.success ||
			getResult.info?.status === 'deleted' ||
			getResult.info?.status === 'terminated',
		`Destroyed sandbox should not be accessible or should show deleted/terminated status`
	);
});
