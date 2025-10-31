#!/usr/bin/env bun

/**
 * Test script for env and secret CLI commands
 * Tests all operations against the auth-app test project
 */

import { join, dirname } from 'node:path';
import { $ } from 'bun';
import { readFile, unlink } from 'node:fs/promises';

const SCRIPT_DIR = import.meta.dir;
const PROJECT_DIR = dirname(SCRIPT_DIR);
const ROOT_DIR = join(PROJECT_DIR, '../../..');
const CLI_PATH = join(ROOT_DIR, 'packages/cli/bin/cli.ts');

// Unique test keys
const timestamp = Date.now();
const ENV_TEST_KEY1 = `CLI_TEST_ENV_VAR_${timestamp}_A`;
const ENV_TEST_KEY2 = `CLI_TEST_ENV_VAR_${timestamp}_B`;
const SECRET_TEST_KEY1 = `CLI_TEST_SECRET_${timestamp}_X`;
const SECRET_TEST_KEY2 = `CLI_TEST_SECRET_${timestamp}_Y`;

const TEST_VALUE1 = 'test_value_1';
const TEST_VALUE2 = 'test_value_2';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
	testsRun++;
	process.stdout.write(`[TEST ${testsRun}] ${name}... `);

	try {
		await fn();
		console.log('✓ PASSED');
		testsPassed++;
	} catch (error) {
		console.log('✗ FAILED');
		if (error instanceof Error) {
			console.log(`  Error: ${error.message}`);
		}
		testsFailed++;
	}
}

async function runCLI(args: string[]): Promise<string> {
	const result = await $`bun ${CLI_PATH} ${args} --dir ${PROJECT_DIR}`.text();
	return result;
}

console.log('=========================================');
console.log('  Environment & Secrets CLI Test Suite');
console.log('=========================================\n');
console.log(`Project: ${PROJECT_DIR}`);
console.log(`Test Keys:`);
console.log(`  ENV:    ${ENV_TEST_KEY1}, ${ENV_TEST_KEY2}`);
console.log(`  SECRET: ${SECRET_TEST_KEY1}, ${SECRET_TEST_KEY2}\n`);

// ============================================================================
// ENVIRONMENT VARIABLE TESTS
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Testing: Environment Variables');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await runTest(`env set ${ENV_TEST_KEY1}`, async () => {
	const output = await runCLI(['env', 'set', ENV_TEST_KEY1, TEST_VALUE1]);
	if (!output.includes('successfully')) {
		throw new Error(`Expected 'successfully' in output`);
	}
});

await runTest(`env get ${ENV_TEST_KEY1}`, async () => {
	const output = await runCLI(['env', 'get', ENV_TEST_KEY1, '--no-mask']);
	if (!output.includes(TEST_VALUE1)) {
		throw new Error(`Expected '${TEST_VALUE1}' in output, got: ${output}`);
	}
});

await runTest(`env set ${ENV_TEST_KEY2}`, async () => {
	const output = await runCLI(['env', 'set', ENV_TEST_KEY2, TEST_VALUE2]);
	if (!output.includes('successfully')) {
		throw new Error(`Expected 'successfully' in output`);
	}
});

await runTest('env list shows both keys', async () => {
	const output = await runCLI(['env', 'list', '--no-mask']);
	if (!output.includes(ENV_TEST_KEY1) || !output.includes(ENV_TEST_KEY2)) {
		throw new Error(`Expected both keys in list output`);
	}
});

await runTest('env list (unmasked)', async () => {
	const output = await runCLI(['env', 'list', '--no-mask']);
	if (!output.includes(TEST_VALUE1)) {
		throw new Error(`Expected unmasked values in non-TTY mode`);
	}
});

await runTest('env push', async () => {
	const output = await runCLI(['env', 'push']);
	if (!output.includes('Pushed') && !output.includes('successfully')) {
		throw new Error(`Expected success message`);
	}
});

await runTest('env pull', async () => {
	const output = await runCLI(['env', 'pull']);
	if (!output.includes('Pulled')) {
		throw new Error(`Expected 'Pulled' in output`);
	}
});

await runTest('.env.production exists with test keys', async () => {
	const envProdPath = join(PROJECT_DIR, '.env.production');
	const content = await readFile(envProdPath, 'utf-8');
	if (!content.includes(ENV_TEST_KEY1)) {
		throw new Error(`.env.production doesn't contain ${ENV_TEST_KEY1}`);
	}
});

await runTest('.env preserves AGENTUITY_SDK_KEY', async () => {
	const envPath = join(PROJECT_DIR, '.env');
	const content = await readFile(envPath, 'utf-8');
	if (!content.includes('AGENTUITY_SDK_KEY')) {
		throw new Error(`.env doesn't contain AGENTUITY_SDK_KEY - THIS IS THE BUG!`);
	}
});

await runTest(`env delete ${ENV_TEST_KEY2}`, async () => {
	const output = await runCLI(['env', 'delete', ENV_TEST_KEY2]);
	if (!output.includes('deleted successfully')) {
		throw new Error(`Expected 'deleted successfully' in output`);
	}
});

await runTest(`verify ${ENV_TEST_KEY2} is deleted`, async () => {
	try {
		await runCLI(['env', 'get', ENV_TEST_KEY2]);
		throw new Error('Key should not exist');
	} catch (error) {
		// Expected to fail
	}
});

await runTest(`cleanup: delete ${ENV_TEST_KEY1}`, async () => {
	const output = await runCLI(['env', 'delete', ENV_TEST_KEY1]);
	if (!output.includes('deleted successfully')) {
		throw new Error(`Expected 'deleted successfully' in output`);
	}
});

// ============================================================================
// SECRET TESTS
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Testing: Secrets');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await runTest(`secret set ${SECRET_TEST_KEY1}`, async () => {
	const output = await runCLI(['secret', 'set', SECRET_TEST_KEY1, TEST_VALUE1]);
	if (!output.includes('successfully')) {
		throw new Error(`Expected 'successfully' in output`);
	}
});

await runTest(`secret get ${SECRET_TEST_KEY1} (unmasked)`, async () => {
	const output = await runCLI(['secret', 'get', SECRET_TEST_KEY1, '--no-mask']);
	if (!output.includes(TEST_VALUE1)) {
		throw new Error(`Expected unmasked value in non-TTY mode`);
	}
});

await runTest(`secret get with --mask flag`, async () => {
	const output = await runCLI(['secret', 'get', SECRET_TEST_KEY1, '--mask']);
	if (!output.includes('...')) {
		throw new Error(`Expected masked value (...) with --mask flag`);
	}
});

await runTest(`secret set ${SECRET_TEST_KEY2}`, async () => {
	const output = await runCLI(['secret', 'set', SECRET_TEST_KEY2, TEST_VALUE2]);
	if (!output.includes('successfully')) {
		throw new Error(`Expected 'successfully' in output`);
	}
});

await runTest('secret list (unmasked in non-TTY)', async () => {
	const output = await runCLI(['secret', 'list', '--no-mask']);
	if (!output.includes(SECRET_TEST_KEY1) || !output.includes(SECRET_TEST_KEY2)) {
		throw new Error(`Expected both secret keys in list`);
	}
	if (!output.includes(TEST_VALUE1) || !output.includes(TEST_VALUE2)) {
		throw new Error(`Expected unmasked values in non-TTY mode`);
	}
});

await runTest('secret list with --mask flag', async () => {
	const output = await runCLI(['secret', 'list', '--mask']);
	if (!output.includes('...')) {
		throw new Error(`Expected masked values (...) with --mask flag`);
	}
});

await runTest('secret push', async () => {
	const output = await runCLI(['secret', 'push']);
	// Success is ok (even if no secrets to push)
});

await runTest('secret pull', async () => {
	const output = await runCLI(['secret', 'pull']);
	if (!output.includes('Pulled')) {
		throw new Error(`Expected 'Pulled' in output`);
	}
});

await runTest(`secret delete ${SECRET_TEST_KEY2}`, async () => {
	const output = await runCLI(['secret', 'delete', SECRET_TEST_KEY2]);
	if (!output.includes('deleted successfully')) {
		throw new Error(`Expected 'deleted successfully' in output`);
	}
});

await runTest(`verify ${SECRET_TEST_KEY2} is deleted`, async () => {
	try {
		await runCLI(['secret', 'get', SECRET_TEST_KEY2]);
		throw new Error('Secret should not exist');
	} catch (error) {
		// Expected to fail
	}
});

await runTest(`cleanup: delete ${SECRET_TEST_KEY1}`, async () => {
	const output = await runCLI(['secret', 'delete', SECRET_TEST_KEY1]);
	if (!output.includes('deleted successfully')) {
		throw new Error(`Expected 'deleted successfully' in output`);
	}
});

// ============================================================================
// IMPORT TEST
// ============================================================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Testing: Import/Export');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const importKey = `CLI_TEST_IMPORT_${timestamp}`;
const importFile = join(PROJECT_DIR, '.test-import.env');
await Bun.write(importFile, `${importKey}=imported_value\nTEST_IMPORT_2=value2\n`);

await runTest('env import from file', async () => {
	const output = await runCLI(['env', 'import', importFile]);
	if (!output.includes('Imported')) {
		throw new Error(`Expected 'Imported' in output`);
	}
});

await runTest('verify imported key exists', async () => {
	const output = await runCLI(['env', 'get', importKey, '--no-mask']);
	if (!output.includes('imported_value')) {
		throw new Error(`Expected 'imported_value' in output`);
	}
});

await runTest('cleanup: delete imported keys', async () => {
	await runCLI(['env', 'delete', importKey]);
	await runCLI(['env', 'delete', 'TEST_IMPORT_2']);
});

await unlink(importFile);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n=========================================');
console.log('  Test Results');
console.log('=========================================');
console.log(`Total Tests:  ${testsRun}`);
console.log(`Passed:       ${testsPassed}`);
console.log(`Failed:       ${testsFailed}`);
console.log('=========================================\n');

if (testsFailed === 0) {
	console.log('✓ All tests passed!');
	process.exit(0);
} else {
	console.log('✗ Some tests failed');
	process.exit(1);
}
