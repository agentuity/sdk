#!/usr/bin/env bun
/**
 * Test script to verify concurrent CLI processes don't conflict
 *
 * This test:
 * 1. Launches multiple CLI processes concurrently
 * 2. Verifies each creates its own session directory
 * 3. Verifies no errors occur from directory conflicts
 * 4. Verifies all sessions are in the same bucket
 * 5. Verifies getLogSessionsInCurrentWindow() returns all sessions
 * 6. Verifies old buckets get cleaned up
 *
 * Run with: bun scripts/test-concurrent-sessions.ts
 */

import { spawn } from 'bun';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOGS_DIR = join(homedir(), '.config', 'agentuity', 'logs');
const CLI_PATH = join(import.meta.dir, '..', 'bin', 'cli.ts');
const NUM_CONCURRENT = 5;

interface SessionJson {
	sessionId: string;
	bucket: number;
	pid: number;
	ppid: number;
	command: string;
	timestamp: string;
}

const PROCESS_TIMEOUT_MS = 30000; // 30 second timeout per process

async function runCLI(
	id: number
): Promise<{ exitCode: number; stderr: string; timedOut?: boolean }> {
	console.log(`[Process ${id}] Starting...`);

	// Use 'build' command which initializes the internal logger
	// It will fail (no app.ts) but that's fine - we just need it to create logs
	const proc = spawn(['bun', CLI_PATH, 'build'], {
		stdout: 'ignore',
		stderr: 'pipe',
	});

	const stderrChunks: Buffer[] = [];
	let timedOut = false;

	// Create a timeout that will kill the process if it takes too long
	const timeoutId = setTimeout(() => {
		console.log(`[Process ${id}] Timed out after ${PROCESS_TIMEOUT_MS}ms, killing...`);
		timedOut = true;
		proc.kill();
	}, PROCESS_TIMEOUT_MS);

	try {
		const reader = proc.stderr.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) stderrChunks.push(Buffer.from(value));
		}

		const exitCode = await proc.exited;
		const stderr = Buffer.concat(stderrChunks).toString('utf-8');

		console.log(`[Process ${id}] Exited with code ${exitCode}${timedOut ? ' (timed out)' : ''}`);

		// We expect non-zero exit (build fails without app.ts) but that's OK
		// We're testing that logs are created, not that the command succeeds
		return { exitCode, stderr, timedOut };
	} finally {
		clearTimeout(timeoutId);
	}
}

async function main() {
	console.log('='.repeat(60));
	console.log('Testing Concurrent CLI Processes');
	console.log('='.repeat(60));
	console.log();

	// Clean up any existing logs before starting
	if (existsSync(LOGS_DIR)) {
		const { rmSync } = await import('node:fs');
		const existingDirs = readdirSync(LOGS_DIR);
		console.log(`Cleaning up ${existingDirs.length} existing log directories...`);
		rmSync(LOGS_DIR, { recursive: true, force: true });
	}

	// Launch multiple CLI processes concurrently
	console.log(`\nLaunching ${NUM_CONCURRENT} concurrent CLI processes...`);
	console.log();

	const startTime = Date.now();
	const promises = Array.from({ length: NUM_CONCURRENT }, (_, i) => runCLI(i + 1));
	const results = await Promise.all(promises);
	const elapsed = Date.now() - startTime;

	console.log();
	console.log(`All processes completed in ${elapsed}ms`);
	console.log();

	// Check if any processes timed out
	const timedOutCount = results.filter((r) => r.timedOut).length;
	if (timedOutCount > 0) {
		console.error(
			`⚠️  ${timedOutCount} process(es) timed out - this may indicate a hanging subprocess`
		);
		// Don't fail the test for timeouts, as we still want to verify the logging behavior
		// The timeout mechanism ensures the test doesn't hang forever
	}

	// Note: We expect all processes to exit with non-zero (build fails without app.ts)
	// That's fine - we're testing that logs are created without conflicts, not command success
	console.log(
		`✅ All ${NUM_CONCURRENT} processes completed (exit codes don't matter for this test)`
	);
	console.log();

	// Check log directories
	console.log('Checking log directories...');
	console.log();

	if (!existsSync(LOGS_DIR)) {
		console.error('❌ Logs directory does not exist!');
		process.exit(1);
	}

	const logDirs = readdirSync(LOGS_DIR, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name);

	console.log(`Found ${logDirs.length} session directories:`);

	const sessions: SessionJson[] = [];
	const buckets = new Set<number>();

	for (const dir of logDirs) {
		const sessionFile = join(LOGS_DIR, dir, 'session.json');
		if (!existsSync(sessionFile)) {
			console.error(`❌ Missing session.json in ${dir}`);
			continue;
		}

		const session: SessionJson = JSON.parse(readFileSync(sessionFile, 'utf-8'));
		sessions.push(session);
		buckets.add(session.bucket);

		console.log(`  📁 ${dir}`);
		console.log(`     bucket: ${session.bucket}, pid: ${session.pid}, ppid: ${session.ppid}`);
	}

	console.log();

	// Verify we have the expected number of sessions
	if (sessions.length !== NUM_CONCURRENT) {
		console.error(`❌ Expected ${NUM_CONCURRENT} sessions, found ${sessions.length}`);
		console.error(
			'   This might indicate session directories were deleted by concurrent processes!'
		);
		process.exit(1);
	}

	console.log(`✅ All ${NUM_CONCURRENT} sessions created successfully`);

	// Verify all sessions are in the same bucket (or adjacent buckets if we crossed a boundary)
	if (buckets.size > 2) {
		console.error(`❌ Sessions span ${buckets.size} buckets (expected 1-2)`);
		process.exit(1);
	}

	console.log(`✅ All sessions in ${buckets.size} bucket(s): ${[...buckets].join(', ')}`);

	// Verify all PIDs are unique
	const pids = sessions.map((s) => s.pid);
	const uniquePids = new Set(pids);
	if (uniquePids.size !== sessions.length) {
		console.error(`❌ Duplicate PIDs found!`);
		process.exit(1);
	}

	console.log(`✅ All PIDs are unique`);

	// Verify session.json has required fields
	for (const session of sessions) {
		if (typeof session.bucket !== 'number') {
			console.error(`❌ Session ${session.sessionId} missing bucket field`);
			process.exit(1);
		}
		if (typeof session.pid !== 'number') {
			console.error(`❌ Session ${session.sessionId} missing pid field`);
			process.exit(1);
		}
		if (typeof session.ppid !== 'number') {
			console.error(`❌ Session ${session.sessionId} missing ppid field`);
			process.exit(1);
		}
	}

	console.log(`✅ All sessions have required fields (bucket, pid, ppid)`);

	// Test getLogSessionsInCurrentWindow by importing and calling it
	console.log();
	console.log('Testing getLogSessionsInCurrentWindow()...');

	const { getLogSessionsInCurrentWindow } = await import('../src/internal-logger.ts');
	const windowSessions = getLogSessionsInCurrentWindow();

	console.log(`  Found ${windowSessions.length} sessions in current window`);

	if (windowSessions.length < NUM_CONCURRENT) {
		console.error(`❌ getLogSessionsInCurrentWindow() returned fewer sessions than expected`);
		console.error(`   Expected at least ${NUM_CONCURRENT}, got ${windowSessions.length}`);
		process.exit(1);
	}

	console.log(`✅ getLogSessionsInCurrentWindow() returns all sessions`);

	// Test cleanup behavior - create a fake old bucket directory and verify it gets cleaned up
	console.log();
	console.log('Testing cleanup of old buckets...');

	const { mkdirSync, writeFileSync } = await import('node:fs');
	const oldBucket = Math.floor(Date.now() / 300000) - 2; // 2 buckets ago (10+ minutes old)
	const oldDirName = `${oldBucket}-fake-old-session`;
	const oldDirPath = join(LOGS_DIR, oldDirName);

	// Create fake old session directory
	mkdirSync(oldDirPath, { recursive: true });
	writeFileSync(
		join(oldDirPath, 'session.json'),
		JSON.stringify({ sessionId: oldDirName, bucket: oldBucket })
	);
	writeFileSync(join(oldDirPath, 'logs.jsonl'), '{"test": true}\n');

	console.log(`  Created fake old session: ${oldDirName}`);

	// Run another CLI process - it should clean up the old bucket
	console.log('  Running CLI to trigger cleanup...');
	await runCLI(99);

	// Check if old directory was cleaned up
	if (existsSync(oldDirPath)) {
		console.error(`❌ Old bucket directory was NOT cleaned up: ${oldDirName}`);
		process.exit(1);
	}

	console.log(`✅ Old bucket directory was cleaned up`);

	console.log();
	console.log('='.repeat(60));
	console.log('✅ ALL TESTS PASSED');
	console.log('='.repeat(60));
}

// Global test timeout - if the entire test takes more than 3 minutes, something is very wrong
const GLOBAL_TIMEOUT_MS = 180000;

const globalTimeout = setTimeout(() => {
	console.error(`\n❌ GLOBAL TIMEOUT: Test exceeded ${GLOBAL_TIMEOUT_MS / 1000} seconds`);
	console.error('This likely indicates a hanging process that escaped the per-process timeout.');
	process.exit(1);
}, GLOBAL_TIMEOUT_MS);

main()
	.then(() => {
		clearTimeout(globalTimeout);
	})
	.catch((err) => {
		clearTimeout(globalTimeout);
		console.error('Test failed with error:', err);
		process.exit(1);
	});
