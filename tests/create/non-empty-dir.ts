#!/usr/bin/env bun

/**
 * Integration tests for the existing-project gate in
 * `agentuity project create` when the target directory is non-empty.
 *
 * Two cases are exercised against the actual CLI binary, with stdin
 * piped (so the CLI sees a non-TTY environment):
 *
 *   1. Non-empty dir + unknown content + no `--name`
 *        → must exit non-zero (we keep the fatal in non-TTY mode so
 *          callers don't silently scaffold on top of unknown files).
 *
 *   2. Non-empty dir + unknown content + `--name <subdir>`
 *        → must succeed and scaffold into `<dir>/<subdir>` without
 *          touching the original files.
 *
 * The interactive fall-through (TTY → prompt for project name and
 * scaffold into a fresh subdir) is unit-tested in
 * `packages/cli/test/cmd/project/create-dir-empty.test.ts` against the
 * pure `decideNoFrameworkHit` helper, since driving the CLI under a
 * pseudo-TTY isn't part of this repo's test infra.
 *
 * Usage:
 *   bun tests/create/non-empty-dir.ts
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dir, '../..');
const CLI_ENTRY = join(MONOREPO_ROOT, 'packages/cli/src/main.ts');
const TEST_ROOT = join(tmpdir(), `agentuity-non-empty-dir-${Date.now()}`);

const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	blue: '\x1b[34m',
};

function log(message: string, color = colors.reset): void {
	console.log(`${color}${message}${colors.reset}`);
}
function logStep(step: string): void {
	log(`\n━━━ ${step} ━━━`, colors.cyan);
}
function logSuccess(message: string): void {
	log(`✓ ${message}`, colors.green);
}
function logInfo(message: string): void {
	log(`ℹ ${message}`, colors.blue);
}
function logError(message: string): void {
	log(`✗ ${message}`, colors.red);
}

function cleanup(): void {
	if (existsSync(TEST_ROOT)) {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	}
}

interface RunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

async function runCreate(args: string[], cwd: string): Promise<RunResult> {
	const proc = Bun.spawn(['bun', CLI_ENTRY, 'create', ...args], {
		cwd,
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, AGENTUITY_SKIP_VERSION_CHECK: '1' },
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return { exitCode, stdout, stderr };
}

/**
 * Case 1: non-empty dir + no `--name` + non-TTY → must fail.
 *
 * We don't pin the exit code because `ErrorCode.RESOURCE_ALREADY_EXISTS`
 * maps to whatever `getExitCode` returns; we just want "non-zero" plus
 * the user-facing hint about empty dirs / --name <subdir>.
 */
async function caseRefusesOnUnknownContent(): Promise<boolean> {
	logStep('Case 1: non-TTY refuses to scaffold on unknown content');

	const dir = join(TEST_ROOT, 'refuse');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'random.txt'), 'unrelated content\n');
	writeFileSync(join(dir, 'NOTES.md'), '# notes\n');

	const result = await runCreate(['--no-register', '--no-install', '--no-build'], dir);

	if (result.exitCode === 0) {
		logError(`Expected non-zero exit, got ${result.exitCode}`);
		logInfo(`stdout:\n${result.stdout}`);
		logInfo(`stderr:\n${result.stderr}`);
		return false;
	}
	logSuccess(`CLI exited non-zero (${result.exitCode}) as expected`);

	const combined = `${result.stdout}\n${result.stderr}`;
	if (!combined.includes('not empty') || !combined.includes('supported framework')) {
		logError('Error message did not mention "not empty" + "supported framework"');
		logInfo(`stdout:\n${result.stdout}`);
		logInfo(`stderr:\n${result.stderr}`);
		return false;
	}
	logSuccess('Error message references the not-empty / framework guidance');

	// Confirm we did not scaffold anything destructive.
	if (existsSync(join(dir, 'package.json'))) {
		logError('Unexpected package.json written into a non-empty dir');
		return false;
	}
	if (!existsSync(join(dir, 'random.txt'))) {
		logError('Original random.txt disappeared');
		return false;
	}
	logSuccess('Original directory contents preserved');

	return true;
}

/**
 * Case 2: non-empty dir + `--name foo` + non-TTY → must scaffold a
 * fresh subdirectory and leave the parent's existing files alone.
 *
 * This exercises the `opts.name` early-return inside the gate, which
 * is the non-interactive equivalent of the new "fall through to a new
 * subdir" behavior.
 */
async function caseNameFlagScaffoldsSubdir(): Promise<boolean> {
	logStep('Case 2: --name scaffolds into a fresh subdirectory beside existing files');

	const dir = join(TEST_ROOT, 'with-name');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'random.txt'), 'unrelated content\n');
	const subProjectName = 'integration-subdir-project';

	const result = await runCreate(
		[
			'--name',
			subProjectName,
			'--framework',
			'hono',
			'--confirm',
			'--no-register',
			'--no-install',
			'--no-build',
		],
		dir
	);

	if (result.exitCode !== 0) {
		logError(`CLI exited ${result.exitCode}, expected 0`);
		logInfo(`stdout:\n${result.stdout}`);
		logInfo(`stderr:\n${result.stderr}`);
		return false;
	}
	logSuccess('CLI exited 0');

	const subdir = join(dir, subProjectName);
	if (!existsSync(subdir)) {
		logError(`Expected scaffold at ${subdir}`);
		return false;
	}
	if (!existsSync(join(subdir, 'package.json'))) {
		logError('Scaffolded subdir is missing package.json');
		return false;
	}
	logSuccess(`Scaffolded into ${subProjectName}/ with package.json`);

	if (!existsSync(join(dir, 'random.txt'))) {
		logError('Parent dir lost its pre-existing random.txt');
		return false;
	}
	if (existsSync(join(dir, 'package.json'))) {
		logError('Unexpected package.json written into the parent (non-subdir) directory');
		return false;
	}
	logSuccess('Parent directory was not modified');

	return true;
}

async function main(): Promise<void> {
	log('\n╔════════════════════════════════════════════════╗', colors.cyan);
	log('║  Agentuity Create — Non-Empty Dir Behavior     ║', colors.cyan);
	log('╚════════════════════════════════════════════════╝', colors.cyan);

	try {
		cleanup();
		mkdirSync(TEST_ROOT, { recursive: true });

		const cases = [
			{ name: 'refuses on unknown content (non-TTY)', fn: caseRefusesOnUnknownContent },
			{
				name: '--name scaffolds subdir alongside existing files',
				fn: caseNameFlagScaffoldsSubdir,
			},
		];

		let allPassed = true;
		for (const c of cases) {
			const passed = await c.fn();
			if (!passed) {
				allPassed = false;
				logError(`Case failed: ${c.name}`);
			}
		}

		logStep('Cleanup');
		cleanup();

		log('\n╔════════════════════════════════════════════════╗', colors.cyan);
		if (allPassed) {
			log('║              ✓ ALL TESTS PASSED                ║', colors.green);
		} else {
			log('║              ✗ TESTS FAILED                    ║', colors.red);
		}
		log('╚════════════════════════════════════════════════╝', colors.cyan);

		process.exit(allPassed ? 0 : 1);
	} catch (error) {
		logError(`\nUnexpected error: ${error}`);
		cleanup();
		process.exit(1);
	}
}

main();
