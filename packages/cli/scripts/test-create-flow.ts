#!/usr/bin/env bun

/**
 * Integration test for the `agentuity create` command
 *
 * Tests the framework-native scaffolding flow:
 * 1. Creates a new project using --framework hono (fastest to scaffold)
 * 2. Verifies core files are created
 * 3. Verifies Agentuity augmentation (deploy script, .gitignore entries)
 *
 * Usage:
 *   bun scripts/test-create-flow.ts
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dir, '../../..');
const TEST_DIR = join(tmpdir(), `agentuity-test-${Date.now()}`);
const TEST_PROJECT_NAME = 'integration-test-project';
const TEST_PROJECT_PATH = join(TEST_DIR, TEST_PROJECT_NAME);

const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	blue: '\x1b[34m',
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
function _logInfo(message: string) {
	log(`ℹ ${message}`, colors.blue);
}

async function cleanup() {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
}

async function buildCLI(): Promise<boolean> {
	logStep('Step 0: Build All Packages');

	const result = Bun.spawn(['bunx', 'tsc', '--build'], {
		cwd: MONOREPO_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const exitCode = await result.exited;
	if (exitCode !== 0) {
		logError('Failed to build packages');
		return false;
	}

	logSuccess('All packages built successfully');
	return true;
}

async function createProject(): Promise<boolean> {
	logStep('Step 1: Create Project (Hono)');

	mkdirSync(TEST_DIR, { recursive: true });

	// Exercise the built CLI artifact, not the source TypeScript.
	// CLI_RUNTIME picks bun vs node so the same script can be matrixed.
	const cliRuntime = process.env.CLI_RUNTIME ?? 'node';
	const result = Bun.spawn(
		[
			cliRuntime,
			join(MONOREPO_ROOT, 'packages/cli/bin/cli.js'),
			'create',
			'--name',
			TEST_PROJECT_NAME,
			'--framework',
			'hono',
			'--confirm',
			'--no-register',
			'--no-install',
			'--no-build',
		],
		{
			cwd: TEST_DIR,
			stdout: 'inherit',
			stderr: 'inherit',
			env: { ...process.env, AGENTUITY_SKIP_VERSION_CHECK: '1' },
		}
	);

	const exitCode = await result.exited;
	if (exitCode !== 0) {
		logError('Failed to create project');
		return false;
	}

	logSuccess('Project created successfully');
	return true;
}

async function verifyFiles(): Promise<boolean> {
	logStep('Step 2: Verify Files');

	// Core files from Hono scaffolding
	const requiredFiles = ['package.json', '.gitignore'];

	let allGood = true;

	for (const file of requiredFiles) {
		const filePath = join(TEST_PROJECT_PATH, file);
		if (existsSync(filePath)) {
			logSuccess(`Found: ${file}`);
		} else {
			logError(`Missing: ${file}`);
			allGood = false;
		}
	}

	// Verify package.json has Agentuity augmentation
	const pkgPath = join(TEST_PROJECT_PATH, 'package.json');
	if (!existsSync(pkgPath)) {
		logError('package.json not found');
		return false;
	}

	const pkg = await Bun.file(pkgPath).json();

	// Check @agentuity/cli devDep
	if (pkg.devDependencies?.['@agentuity/cli']) {
		logSuccess('package.json has @agentuity/cli devDependency');
	} else {
		logError('package.json missing @agentuity/cli devDependency');
		allGood = false;
	}

	// Check deploy script
	if (pkg.scripts?.deploy === 'agentuity deploy') {
		logSuccess('package.json has deploy script');
	} else {
		logError('package.json missing deploy script');
		allGood = false;
	}

	// Verify .gitignore has Agentuity entries
	const gitignorePath = join(TEST_PROJECT_PATH, '.gitignore');
	if (existsSync(gitignorePath)) {
		const gitignore = await Bun.file(gitignorePath).text();
		if (gitignore.includes('.agentuity/')) {
			logSuccess('.gitignore has .agentuity/ entry');
		} else {
			logError('.gitignore missing .agentuity/ entry');
			allGood = false;
		}
	}

	return allGood;
}

async function main() {
	log('\n╔════════════════════════════════════════════╗', colors.cyan);
	log('║  Agentuity Create Flow Integration Test    ║', colors.cyan);
	log('╚════════════════════════════════════════════╝', colors.cyan);

	try {
		await cleanup();

		const cliBuilt = await buildCLI();
		if (!cliBuilt) process.exit(1);

		const steps = [
			{ name: 'Create Project', fn: createProject },
			{ name: 'Verify Files', fn: verifyFiles },
		];

		let allPassed = true;
		for (const step of steps) {
			const passed = await step.fn();
			if (!passed) {
				allPassed = false;
				break;
			}
		}

		logStep('Cleanup');
		await cleanup();

		log('\n╔════════════════════════════════════════════╗', colors.cyan);
		if (allPassed) {
			log('║           ✓ ALL TESTS PASSED               ║', colors.green);
		} else {
			log('║           ✗ TESTS FAILED                  ║', colors.red);
		}
		log('╚════════════════════════════════════════════╝', colors.cyan);

		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		logError(`\nUnexpected error: ${error}`);
		await cleanup();
		process.exit(1);
	}
}

main();
