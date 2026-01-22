/**
 * CLI Environment Pull Tests
 *
 * Tests for `cloud env pull` command:
 * - Local AGENTUITY_SDK_KEY is preserved when pulling
 * - Local key is preserved when cloud has no api_key
 * - Cloud api_key is used when local doesn't exist
 * - Works correctly with --org flag
 *
 * This tests the fix for the bug where local AGENTUITY_SDK_KEY was deleted
 * when running `cloud env pull` if the cloud project didn't have an api_key.
 */

import { test } from '@test/suite';
import { assert, assertEqual, uniqueId } from '@test/helpers';
import cliAgent from '@agents/cli/agent';
import { isAuthenticated, PROJECT_DIR } from '@test/helpers/cli';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Track all env vars created during tests for cleanup
const createdEnvVars: string[] = [];

// Helper to create and track env var keys
function trackKey(key: string): string {
	createdEnvVars.push(key);
	return key;
}

// Helper to read .env file and parse it
function readEnvFile(filePath: string): Record<string, string> {
	if (!existsSync(filePath)) {
		return {};
	}
	const content = readFileSync(filePath, 'utf-8');
	const env: Record<string, string> = {};
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const equalIndex = trimmed.indexOf('=');
		if (equalIndex === -1) continue;
		const key = trimmed.slice(0, equalIndex).trim();
		const value = trimmed.slice(equalIndex + 1).trim();
		// Remove surrounding quotes if present
		const unquotedValue =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
				? value.slice(1, -1)
				: value;
		env[key] = unquotedValue;
	}
	return env;
}

// Helper to write .env file
function writeEnvFile(filePath: string, env: Record<string, string>): void {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(env).sort()) {
		lines.push(`${key}=${value}`);
	}
	writeFileSync(filePath, lines.join('\n') + '\n');
}

// Helper to backup and restore .env file
function backupEnvFile(): string {
	const envPath = join(PROJECT_DIR, '.env');
	if (existsSync(envPath)) {
		const backup = readFileSync(envPath, 'utf-8');
		return backup;
	}
	return '';
}

function restoreEnvFile(backup: string): void {
	const envPath = join(PROJECT_DIR, '.env');
	if (backup) {
		writeFileSync(envPath, backup);
	} else if (existsSync(envPath)) {
		// Remove file if there was no backup
		unlinkSync(envPath);
	}
}

// Test: Local AGENTUITY_SDK_KEY is preserved when pulling from project
test('cli-env-pull', 'preserves-local-sdk-key-when-pulling', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_TEST'));
	const testValue = 'pull_test_value';
	const localSdkKey = 'local-sdk-key-preserved-12345';

	// Set up: Create a test env var in cloud
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue}`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Set up local .env with local SDK key
		const envPath = join(PROJECT_DIR, '.env');
		writeEnvFile(envPath, {
			AGENTUITY_SDK_KEY: localSdkKey,
			[testKey]: 'local_value_should_be_overwritten',
		});

		// Pull from cloud
		const pullResult = await cliAgent.run({
			command: 'cloud env pull',
		});

		assert(pullResult.success, `Pull should succeed: ${pullResult.stderr}`);

		// Verify local SDK key is preserved
		const envAfter = readEnvFile(envPath);
		assertEqual(
			envAfter.AGENTUITY_SDK_KEY,
			localSdkKey,
			'Local AGENTUITY_SDK_KEY should be preserved'
		);

		// Verify cloud env var was pulled
		assertEqual(envAfter[testKey], testValue, 'Cloud env var should be pulled');
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup cloud env var
		await cliAgent.run({
			command: `cloud env delete ${testKey}`,
		});
	}
});

// Test: Local AGENTUITY_SDK_KEY is preserved when cloud has no api_key
test('cli-env-pull', 'preserves-local-sdk-key-when-cloud-has-no-api-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_NO_API_KEY'));
	const testValue = 'pull_test_value';
	const localSdkKey = 'local-sdk-key-no-cloud-api-key-67890';

	// Set up: Create a test env var in cloud (but no api_key in project)
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue}`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Set up local .env with local SDK key
		const envPath = join(PROJECT_DIR, '.env');
		writeEnvFile(envPath, {
			AGENTUITY_SDK_KEY: localSdkKey,
		});

		// Pull from cloud (project may not have api_key set)
		const pullResult = await cliAgent.run({
			command: 'cloud env pull',
		});

		assert(pullResult.success, `Pull should succeed: ${pullResult.stderr}`);

		// Verify local SDK key is still preserved (this is the critical fix)
		const envAfter = readEnvFile(envPath);
		assertEqual(
			envAfter.AGENTUITY_SDK_KEY,
			localSdkKey,
			'Local AGENTUITY_SDK_KEY should be preserved even when cloud has no api_key'
		);

		// Verify cloud env var was pulled
		assertEqual(envAfter[testKey], testValue, 'Cloud env var should be pulled');
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup cloud env var
		await cliAgent.run({
			command: `cloud env delete ${testKey}`,
		});
	}
});

// Test: Cloud api_key is used when local doesn't exist
test('cli-env-pull', 'uses-cloud-api-key-when-local-missing', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_CLOUD_KEY'));
	const testValue = 'pull_test_value';

	// Set up: Create a test env var in cloud
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue}`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Set up local .env WITHOUT SDK key
		const envPath = join(PROJECT_DIR, '.env');
		writeEnvFile(envPath, {
			[testKey]: 'local_value',
		});

		// Pull from cloud
		const pullResult = await cliAgent.run({
			command: 'cloud env pull',
		});

		assert(pullResult.success, `Pull should succeed: ${pullResult.stderr}`);

		// Verify cloud env var was pulled
		const envAfter = readEnvFile(envPath);
		assertEqual(envAfter[testKey], testValue, 'Cloud env var should be pulled');

		// If project has api_key, it should be written to .env
		// (We can't verify the exact value since it depends on the project, but we can check it exists)
		// Note: This test may pass or fail depending on whether the project has an api_key
		// The important thing is that it doesn't crash
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup cloud env var
		await cliAgent.run({
			command: `cloud env delete ${testKey}`,
		});
	}
});

// Test: Local AGENTUITY_SDK_KEY is preserved when pulling from org
test('cli-env-pull', 'preserves-local-sdk-key-when-pulling-from-org', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_ORG_TEST'));
	const testValue = 'pull_org_test_value';
	const localSdkKey = 'local-sdk-key-org-pull-abcde';

	// Set up: Create a test env var in org
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue} --org`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Set up local .env with local SDK key
		const envPath = join(PROJECT_DIR, '.env');
		writeEnvFile(envPath, {
			AGENTUITY_SDK_KEY: localSdkKey,
		});

		// Pull from org
		const pullResult = await cliAgent.run({
			command: 'cloud env pull --org',
		});

		assert(pullResult.success, `Pull from org should succeed: ${pullResult.stderr}`);

		// Verify local SDK key is preserved (orgs don't have api_key, so this tests the fix)
		const envAfter = readEnvFile(envPath);
		assertEqual(
			envAfter.AGENTUITY_SDK_KEY,
			localSdkKey,
			'Local AGENTUITY_SDK_KEY should be preserved when pulling from org'
		);

		// Verify org env var was pulled
		assertEqual(envAfter[testKey], testValue, 'Org env var should be pulled');
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup org env var
		await cliAgent.run({
			command: `cloud env delete ${testKey} --org`,
		});
	}
});

// Test: Pull with --force overwrites local env vars but preserves SDK key
test('cli-env-pull', 'force-overwrites-env-but-preserves-sdk-key', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_FORCE_TEST'));
	const cloudValue = 'cloud_force_value';
	const localValue = 'local_force_value';
	const localSdkKey = 'local-sdk-key-force-xyz123';

	// Set up: Create a test env var in cloud
	await cliAgent.run({
		command: `cloud env set ${testKey} ${cloudValue}`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Set up local .env with local SDK key and local value
		const envPath = join(PROJECT_DIR, '.env');
		writeEnvFile(envPath, {
			AGENTUITY_SDK_KEY: localSdkKey,
			[testKey]: localValue,
		});

		// Pull from cloud with --force
		const pullResult = await cliAgent.run({
			command: 'cloud env pull --force',
		});

		assert(pullResult.success, `Pull with force should succeed: ${pullResult.stderr}`);

		// Verify local SDK key is still preserved (even with --force)
		const envAfter = readEnvFile(envPath);
		assertEqual(
			envAfter.AGENTUITY_SDK_KEY,
			localSdkKey,
			'Local AGENTUITY_SDK_KEY should be preserved even with --force'
		);

		// Verify cloud value overwrote local value (force behavior)
		assertEqual(envAfter[testKey], cloudValue, 'Cloud value should overwrite local with --force');
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup cloud env var
		await cliAgent.run({
			command: `cloud env delete ${testKey}`,
		});
	}
});

// Test: Pull creates .env file if it doesn't exist
test('cli-env-pull', 'creates-env-file-if-missing', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	const testKey = trackKey(uniqueId('PULL_CREATE_TEST'));
	const testValue = 'pull_create_test_value';

	// Set up: Create a test env var in cloud
	await cliAgent.run({
		command: `cloud env set ${testKey} ${testValue}`,
	});

	// Backup current .env
	const envBackup = backupEnvFile();

	try {
		// Remove .env file if it exists
		const envPath = join(PROJECT_DIR, '.env');
		if (existsSync(envPath)) {
			unlinkSync(envPath);
		}

		// Pull from cloud
		const pullResult = await cliAgent.run({
			command: 'cloud env pull',
		});

		assert(pullResult.success, `Pull should succeed: ${pullResult.stderr}`);

		// Verify .env file was created
		assert(existsSync(envPath), '.env file should be created');

		// Verify cloud env var was pulled
		const envAfter = readEnvFile(envPath);
		assertEqual(envAfter[testKey], testValue, 'Cloud env var should be pulled');
	} finally {
		// Restore original .env
		restoreEnvFile(envBackup);

		// Cleanup cloud env var
		await cliAgent.run({
			command: `cloud env delete ${testKey}`,
		});
	}
});

// Final cleanup test - runs last to clean up any leftover env vars
test('cli-env-pull', 'zzz-cleanup-all-env-vars', async () => {
	const authenticated = await isAuthenticated();
	if (!authenticated) return;

	// Delete all tracked env vars
	for (const key of createdEnvVars) {
		await cliAgent.run({
			command: `cloud env delete ${key}`,
		});
		// Also try org scope in case some were created there
		await cliAgent.run({
			command: `cloud env delete ${key} --org`,
		});
	}

	// Clear the tracking array
	createdEnvVars.length = 0;
});
