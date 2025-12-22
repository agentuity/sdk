#!/usr/bin/env bun
/**
 * Test bundled executable create command
 *
 * This test verifies that the bundled executable (not the source CLI) can
 * successfully run the create command without missing dependencies like vite.
 *
 * Prerequisites:
 * - Executable must already be built for current platform
 * - Run: ./scripts/build-executables.ts --skip-sign --platform=<current-platform>
 *
 * Usage:
 *   bun scripts/test-bundled-create.ts
 *   bun scripts/test-bundled-create.ts --binary=./dist/bin/agentuity-darwin-arm64
 */

import { join, resolve } from 'node:path';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Colors for output
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset) {
	console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: string) {
	log(`\n━━━ ${step} ━━━`, colors.cyan);
}

function logSuccess(message: string) {
	log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
	log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
	log(`ℹ ${message}`, colors.blue);
}

// Detect platform
function detectPlatform(): string {
	const os = process.platform === 'darwin' ? 'darwin' : 'linux';
	const arch = process.arch === 'x64' ? 'x64' : 'arm64';
	return `${os}-${arch}`;
}

// Parse CLI args
function parseArgs(): { binaryPath: string | null } {
	const args = process.argv.slice(2);
	let binaryPath: string | null = null;

	for (const arg of args) {
		if (arg.startsWith('--binary=')) {
			binaryPath = arg.split('=')[1];
		}
	}

	return { binaryPath };
}

async function main() {
	log('╭──────────────────────────────────────────────╮', colors.cyan);
	log('│  Bundled Executable Create Command Test     │', colors.cyan);
	log('╰──────────────────────────────────────────────╯', colors.cyan);

	const MONOREPO_ROOT = resolve(import.meta.dir, '../../..');
	const TEMPLATES_DIR = join(MONOREPO_ROOT, 'templates');
	const CLI_ROOT = join(MONOREPO_ROOT, 'packages/cli');
	const TEST_DIR = join(tmpdir(), `agentuity-bundled-test-${Date.now()}`);
	const TEST_PROJECT_NAME = 'bundled-test-project';
	const TEST_PROJECT_PATH = join(TEST_DIR, TEST_PROJECT_NAME);

	// Detect or use provided binary path
	const { binaryPath: providedBinary } = parseArgs();
	const platform = detectPlatform();
	const binaryPath = providedBinary || join(CLI_ROOT, 'dist', 'bin', `agentuity-${platform}`);

	logInfo(`Platform: ${platform}`);
	logInfo(`Binary path: ${binaryPath}`);
	logInfo(`Templates dir: ${TEMPLATES_DIR}`);

	// Check binary exists
	if (!existsSync(binaryPath)) {
		logError(`Binary not found: ${binaryPath}`);
		logInfo(
			`Build it first: cd ${CLI_ROOT} && ./scripts/build-executables.ts --skip-sign --platform=${platform}`
		);
		process.exit(1);
	}

	// Check templates exist
	if (!existsSync(TEMPLATES_DIR)) {
		logError(`Templates directory not found: ${TEMPLATES_DIR}`);
		process.exit(1);
	}

	// Cleanup any existing test directory
	if (existsSync(TEST_DIR)) {
		logInfo('Cleaning up existing test directory...');
		rmSync(TEST_DIR, { recursive: true, force: true });
	}

	// Create test directory
	mkdirSync(TEST_DIR, { recursive: true });

	try {
		logStep('Step 1: Test bundled executable can run create command');

		// Run create command with bundled executable
		const result = Bun.spawn(
			[
				binaryPath,
				'create',
				'--name',
				TEST_PROJECT_NAME,
				'--template-dir',
				TEMPLATES_DIR,
				'--template',
				'default', // Use default template
				'--confirm',
				'--no-register',
				'--no-install', // Skip install to make test faster
				'--no-build', // Skip build to make test faster
			],
			{
				cwd: TEST_DIR,
				stdout: 'pipe',
				stderr: 'pipe',
				env: {
					...process.env,
					AGENTUITY_SKIP_VERSION_CHECK: '1', // Skip version check in CI
				},
			}
		);

		const stdout = await new Response(result.stdout).text();
		const stderr = await new Response(result.stderr).text();
		const exitCode = await result.exited;

		// Log output
		if (stdout.trim()) {
			console.log(stdout);
		}
		if (stderr.trim()) {
			console.error(stderr);
		}

		// Check for specific errors that indicate bundling issues
		const output = stdout + stderr;

		if (output.includes('Cannot find package')) {
			logError('FAILED: Bundled executable is missing dependencies');
			logError('This indicates static imports that should be dynamic');
			process.exit(1);
		}

		if (output.includes('error: Cannot find module')) {
			logError('FAILED: Bundled executable has module resolution errors');
			process.exit(1);
		}

		if (exitCode !== 0) {
			logError(`FAILED: Create command exited with code ${exitCode}`);
			process.exit(1);
		}

		logSuccess('Create command executed without errors');

		logStep('Step 2: Verify project files were created');

		// Check that basic files exist
		const expectedFiles = [
			join(TEST_PROJECT_PATH, 'package.json'),
			join(TEST_PROJECT_PATH, 'agentuity.config.ts'),
			join(TEST_PROJECT_PATH, 'src'),
		];

		let allFilesExist = true;
		for (const file of expectedFiles) {
			if (!existsSync(file)) {
				logError(`Missing file: ${file}`);
				allFilesExist = false;
			} else {
				logSuccess(`Found: ${file}`);
			}
		}

		if (!allFilesExist) {
			logError('FAILED: Not all expected files were created');
			process.exit(1);
		}

		logSuccess('All expected files exist');

		logStep('Step 3: Verify package.json has correct dependencies');

		const packageJsonPath = join(TEST_PROJECT_PATH, 'package.json');
		const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());

		// Check for @agentuity dependencies
		const hasAgentuityDeps =
			packageJson.dependencies?.['@agentuity/runtime'] ||
			packageJson.dependencies?.['@agentuity/server'];

		if (!hasAgentuityDeps) {
			logError('FAILED: package.json missing @agentuity dependencies');
			process.exit(1);
		}

		logSuccess('package.json has expected dependencies');

		// Final cleanup
		logStep('Cleanup');
		rmSync(TEST_DIR, { recursive: true, force: true });
		logSuccess('Test directory cleaned up');

		log('\n╭──────────────────────────────────────────────╮', colors.green);
		log('│          ✓ All tests passed!                │', colors.green);
		log('╰──────────────────────────────────────────────╯', colors.green);
		log('', colors.reset);

		process.exit(0);
	} catch (error) {
		logError(`Test failed with error: ${error}`);
		// Cleanup on error
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		process.exit(1);
	}
}

main();
