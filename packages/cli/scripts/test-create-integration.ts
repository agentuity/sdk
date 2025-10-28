#!/usr/bin/env bun
/**
 * Integration test for agentuity create command
 *
 * Tests both creation flows:
 * - Case 1: CLI flow (agentuity create --dev)
 * - Case 2: Direct bun create flow (bun create agentuity-dev)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), 'agentuity-create-test');
const cliPath = join(import.meta.dir, '../bin/cli.ts');

const log = (message: string) => console.log(`  ${message}`);
const error = (message: string) => console.error(`  ❌ ${message}`);
const success = (message: string) => console.log(`  ✓ ${message}`);

async function cleanup() {
	if (existsSync(testDir)) {
		await Bun.$`rm -rf ${testDir}`.quiet();
	}
}

async function verifyProject(projectPath: string, expectedName: string): Promise<boolean> {
	let passed = true;

	// Check project exists
	if (!existsSync(projectPath)) {
		error(`Project directory not found: ${projectPath}`);
		return false;
	}

	// Check package.json
	const packageJsonPath = join(projectPath, 'package.json');
	if (!existsSync(packageJsonPath)) {
		error('package.json not found');
		return false;
	}

	const packageJson = await Bun.file(packageJsonPath).json();

	if (packageJson.name !== expectedName) {
		error(`package.json name mismatch: expected "${expectedName}", got "${packageJson.name}"`);
		passed = false;
	} else {
		success(`package.json name: ${expectedName}`);
	}

	if (!packageJson.private) {
		error('package.json should have private: true');
		passed = false;
	} else {
		success('package.json has private: true');
	}

	if (packageJson['bun-create']) {
		error('package.json should not have bun-create section');
		passed = false;
	} else {
		success('package.json bun-create section removed');
	}

	// Check README updated
	const readmePath = join(projectPath, 'README.md');
	if (existsSync(readmePath)) {
		const readme = await Bun.file(readmePath).text();
		if (readme.includes('{{PROJECT_NAME}}')) {
			error('README.md still contains {{PROJECT_NAME}} placeholder');
			passed = false;
		} else if (readme.includes(`# ${expectedName}`)) {
			success('README.md updated with project name');
		} else {
			error('README.md does not contain expected project name');
			passed = false;
		}
	} else {
		error('README.md not found');
		passed = false;
	}

	// Check AGENTS.md updated
	const agentsMdPath = join(projectPath, 'AGENTS.md');
	if (existsSync(agentsMdPath)) {
		const agentsMd = await Bun.file(agentsMdPath).text();
		if (agentsMd.includes('{{PROJECT_NAME}}')) {
			error('AGENTS.md still contains {{PROJECT_NAME}} placeholder');
			passed = false;
		} else if (agentsMd.includes(expectedName)) {
			success('AGENTS.md updated with project name');
		} else {
			error('AGENTS.md does not contain expected project name');
			passed = false;
		}
	} else {
		error('AGENTS.md not found');
		passed = false;
	}

	// Check setup.ts removed
	const setupPath = join(projectPath, 'setup.ts');
	if (existsSync(setupPath)) {
		error('setup.ts should have been removed');
		passed = false;
	} else {
		success('setup.ts removed');
	}

	return passed;
}

async function testCase1() {
	console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('Case 1: CLI Flow (agentuity create --dev)');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const projectName = 'CLI Test Project!';
	const expectedName = 'cli-test-project';
	const projectPath = join(testDir, expectedName);

	log(`Creating project: "${projectName}"`);
	log(`Expected directory: ${expectedName}`);

	try {
		const result = Bun.spawn(
			['bun', cliPath, 'create', '--name', projectName, '--dir', testDir, '--dev', '--confirm'],
			{
				stdout: 'pipe',
				stderr: 'pipe',
			}
		);

		await result.exited;

		if (result.exitCode !== 0) {
			const stderr = await new Response(result.stderr).text();
			error(`CLI create command failed: ${stderr}`);
			return false;
		}

		success('CLI create command completed');

		return await verifyProject(projectPath, expectedName);
	} catch (err) {
		error(`Test failed: ${err}`);
		return false;
	}
}

async function testCase2() {
	console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('Case 2: Direct bun create Flow');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const projectName = 'direct-create-test';
	const projectPath = join(testDir, projectName);

	log(`Creating project: ${projectName}`);

	try {
		const result = Bun.spawn(['bun', 'create', 'agentuity-dev', projectName], {
			cwd: testDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		await result.exited;

		if (result.exitCode !== 0) {
			const stderr = await new Response(result.stderr).text();
			error(`bun create command failed: ${stderr}`);
			return false;
		}

		success('bun create command completed');

		return await verifyProject(projectPath, projectName);
	} catch (err) {
		error(`Test failed: ${err}`);
		return false;
	}
}

async function runTests() {
	console.log('\n╔════════════════════════════════════════╗');
	console.log('║  Integration Test: agentuity create   ║');
	console.log('╚════════════════════════════════════════╝\n');

	// Setup
	log('Setting up dev template...');
	const setupResult = Bun.spawn(['bun', 'run', 'setup-dev-template'], {
		cwd: join(import.meta.dir, '..'),
		stdout: 'pipe',
		stderr: 'pipe',
	});

	await setupResult.exited;

	if (setupResult.exitCode !== 0) {
		error('Failed to setup dev template');
		process.exit(1);
	}
	success('Dev template ready\n');

	// Create test directory
	await cleanup();
	await Bun.$`mkdir -p ${testDir}`.quiet();

	// Run tests
	const case1Passed = await testCase1();
	const case2Passed = await testCase2();

	// Cleanup
	console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('Cleanup');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	await cleanup();
	success('Test artifacts cleaned up');

	// Results
	console.log('\n╔════════════════════════════════════════╗');
	console.log('║            Test Results                ║');
	console.log('╚════════════════════════════════════════╝\n');

	console.log(`  Case 1 (CLI Flow):        ${case1Passed ? '✓ PASSED' : '❌ FAILED'}`);
	console.log(`  Case 2 (bun create Flow): ${case2Passed ? '✓ PASSED' : '❌ FAILED'}`);

	if (case1Passed && case2Passed) {
		console.log('\n  🎉 All integration tests passed!\n');
		process.exit(0);
	} else {
		console.log('\n  ❌ Some tests failed\n');
		process.exit(1);
	}
}

runTests().catch((err) => {
	console.error('Test suite failed:', err);
	process.exit(1);
});
