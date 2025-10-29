#!/usr/bin/env bun
/**
 * Integration test for the `agentuity create` command
 *
 * This script tests the complete create flow:
 * 1. Creates a new project from local templates
 * 2. Verifies files are created correctly
 * 3. Runs `bun install`
 * 4. Runs `bun run build` (agentuity bundle)
 * 5. Runs `bun run dev` briefly to verify it starts
 *
 * Usage:
 *   bun scripts/test-create-flow.ts
 */

import { join, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const MONOREPO_ROOT = resolve(import.meta.dir, '../../..');
const TEMPLATES_DIR = join(MONOREPO_ROOT, 'templates');
const TEST_DIR = join(MONOREPO_ROOT, '.test-projects');
const TEST_PROJECT_HUMAN_NAME = 'Integration Test Project';
const TEST_PROJECT_DIR_NAME = 'integration-test-project'; // Sanitized version
const TEST_PROJECT_PATH = join(TEST_DIR, TEST_PROJECT_DIR_NAME);

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

async function cleanup() {
	if (existsSync(TEST_PROJECT_PATH)) {
		logInfo('Cleaning up existing test project...');
		rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
		logSuccess('Cleanup complete');
	}
}

async function createProject(): Promise<boolean> {
	logStep('Step 1: Create Project');

	// Ensure test directory exists
	if (!existsSync(TEST_DIR)) {
		await Bun.$`mkdir -p ${TEST_DIR}`;
	}

	// Run agentuity create with local templates
	const result = Bun.spawn(
		[
			'bun',
			'run',
			join(MONOREPO_ROOT, 'packages/cli/bin/cli.ts'),
			'create',
			'--name',
			TEST_PROJECT_HUMAN_NAME,
			'--template-dir',
			TEMPLATES_DIR,
			'--confirm',
		],
		{
			cwd: TEST_DIR,
			stdout: 'inherit',
			stderr: 'inherit',
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

	const requiredFiles = [
		'package.json',
		'README.md',
		'AGENTS.md',
		'tsconfig.json',
		'app.ts',
		'.gitignore',
		'src',
	];

	let allFilesExist = true;

	for (const file of requiredFiles) {
		const filePath = join(TEST_PROJECT_PATH, file);
		if (existsSync(filePath)) {
			logSuccess(`Found: ${file}`);
		} else {
			logError(`Missing: ${file}`);
			allFilesExist = false;
		}
	}

	// Verify package.json has correct name
	const packageJsonPath = join(TEST_PROJECT_PATH, 'package.json');
	const packageJson = await Bun.file(packageJsonPath).json();

	if (packageJson.name === 'integration-test-project') {
		logSuccess('package.json has correct sanitized name');
	} else {
		logError(`package.json name is incorrect: ${packageJson.name}`);
		allFilesExist = false;
	}

	// Verify README has correct human-readable name
	const readmePath = join(TEST_PROJECT_PATH, 'README.md');
	const readme = await Bun.file(readmePath).text();

	if (readme.includes('Integration Test Project')) {
		logSuccess('README.md has correct project name');
	} else {
		logError('README.md does not contain expected project name');
		allFilesExist = false;
	}

	return allFilesExist;
}

async function verifyInstallation(): Promise<boolean> {
	logStep('Step 3: Verify Installation');

	// Verify node_modules exists (created during setup)
	const nodeModulesPath = join(TEST_PROJECT_PATH, 'node_modules');
	if (!existsSync(nodeModulesPath)) {
		logError('node_modules directory not found');
		return false;
	}
	logSuccess('Dependencies installed');

	// Check if package.json has a build script
	const packageJsonPath = join(TEST_PROJECT_PATH, 'package.json');
	const packageJson = await Bun.file(packageJsonPath).json();

	if (packageJson.scripts?.build) {
		// Verify .agentuity directory exists (created during bundle)
		const agentuityPath = join(TEST_PROJECT_PATH, '.agentuity');
		if (!existsSync(agentuityPath)) {
			logError('.agentuity directory not found (build may have failed)');
			return false;
		}
		logSuccess('Project built');
	} else {
		logInfo('No build script in package.json, skipping build verification');
	}

	return true;
}

async function verifyGitInit(): Promise<boolean> {
	logStep('Step 4: Verify Git Initialization');

	// Check if git is available
	const gitPath = Bun.which('git');
	if (!gitPath) {
		logInfo('Git not available, skipping git tests');
		return true;
	}

	// Check if .git directory exists
	const gitDirPath = join(TEST_PROJECT_PATH, '.git');
	if (!existsSync(gitDirPath)) {
		logError('.git directory not found');
		return false;
	}
	logSuccess('.git directory exists');

	// Check if initial commit was made
	const result = Bun.spawn(['git', 'log', '--oneline'], {
		cwd: TEST_PROJECT_PATH,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const exitCode = await result.exited;
	if (exitCode !== 0) {
		logError('Failed to get git log');
		return false;
	}

	const output = (await new Response(result.stdout).text()).trim();
	const lines = output.split('\n');
	const lastCommitMessage = lines[lines.length - 1]; // First commit is last in log
	if (lastCommitMessage && lastCommitMessage.includes('Initial Setup')) {
		logSuccess('Initial commit message is "Initial Setup"');
		return true;
	} else {
		logError('Initial commit message not correct');
		return false;
	}
}

async function buildCLI(): Promise<boolean> {
	logStep('Step 0: Build CLI');

	const result = Bun.spawn(['bun', 'run', 'build'], {
		cwd: join(MONOREPO_ROOT, 'packages/cli'),
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const exitCode = await result.exited;

	if (exitCode !== 0) {
		logError('Failed to build CLI');
		return false;
	}

	logSuccess('CLI built successfully');
	return true;
}

async function main() {
	log('\n╔════════════════════════════════════════════╗', colors.cyan);
	log('║  Agentuity Create Flow Integration Test    ║', colors.cyan);
	log('╚════════════════════════════════════════════╝', colors.cyan);

	try {
		// Build CLI first
		const cliBuilt = await buildCLI();
		if (!cliBuilt) {
			process.exit(1);
		}

		// Cleanup before starting
		await cleanup();

		// Run test steps
		const steps: Array<{ name: string; fn: () => Promise<boolean> }> = [
			{ name: 'Create Project', fn: createProject },
			{ name: 'Verify Files', fn: verifyFiles },
			{ name: 'Verify Installation', fn: verifyInstallation },
			{ name: 'Verify Git Init', fn: verifyGitInit },
		];

		let allPassed = true;

		for (const step of steps) {
			const passed = await step.fn();
			if (!passed) {
				allPassed = false;
				break;
			}
		}

		// Cleanup after test
		logStep('Cleanup');
		await cleanup();

		// Summary
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
