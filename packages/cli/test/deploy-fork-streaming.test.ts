/**
 * Tests for deploy-fork output streaming.
 *
 * Validates that child process stdout/stderr is streamed to a temp file on disk
 * instead of being accumulated in memory. This prevents OOM crashes when the
 * child produces large output (the original bug: Bun crashed with
 * ERR_STRING_TOO_LONG / Illegal Instruction when outputBuffer grew past ~2 GB).
 */
import { describe, test, expect, afterEach } from 'bun:test';
import { spawn } from 'bun';
import { createWriteStream, existsSync, statSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureStreamToFile } from '../src/utils/stream-capture';

describe('deploy-fork streaming', () => {
	const tempFiles: string[] = [];

	afterEach(() => {
		for (const f of tempFiles) {
			if (existsSync(f)) {
				try {
					unlinkSync(f);
				} catch {
					// ignore
				}
			}
		}
		tempFiles.length = 0;
	});

	test('streams large child output to file without holding it in memory', async () => {
		// Generate ~10 MB of output from a child process.  This is large enough
		// to demonstrate the pattern but small enough to run quickly in CI.
		const targetBytes = 10 * 1024 * 1024; // 10 MB
		const lineSize = 100; // bytes per line (approx)
		const lineCount = Math.ceil(targetBytes / lineSize);

		const rawLogsFile = join(tmpdir(), `deploy-fork-test-${Date.now()}.txt`);
		tempFiles.push(rawLogsFile);

		// Spawn a child that outputs many lines to stdout
		const proc = spawn({
			cmd: [
				'bun',
				'-e',
				`for(let i=0;i<${lineCount};i++) process.stdout.write('x'.repeat(${lineSize - 1})+'\\n')`,
			],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const captured = await captureStreamToFile(
			proc.stdout as ReadableStream<Uint8Array>,
			rawLogsFile
		);
		await proc.exited;

		// File must exist and contain roughly the expected amount of data
		expect(existsSync(rawLogsFile)).toBe(true);
		const fileSize = statSync(rawLogsFile).size;
		expect(fileSize).toBeGreaterThan(targetBytes * 0.9);
		expect(captured).toBe(fileSize);
	});

	test('captured file can be streamed to fetch body via Bun.file()', async () => {
		const rawLogsFile = join(tmpdir(), `deploy-fork-test-bunfile-${Date.now()}.txt`);
		tempFiles.push(rawLogsFile);

		// Write some content via the streaming pattern
		const proc = spawn({
			cmd: ['bun', '-e', 'for(let i=0;i<1000;i++) console.log("line "+i)'],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		await captureStreamToFile(proc.stdout as ReadableStream<Uint8Array>, rawLogsFile);
		await proc.exited;

		// Verify that Bun.file() can read the file and it implements Blob
		const file = Bun.file(rawLogsFile);
		expect(file.size).toBeGreaterThan(0);

		// The file should be usable as a fetch body (Blob interface).
		// We can't actually PUT to Pulse in a unit test, but we can verify
		// that the Blob text matches what's on disk.
		const blobText = await file.text();
		const diskText = readFileSync(rawLogsFile, 'utf-8');
		expect(blobText).toBe(diskText);
		expect(diskText).toContain('line 0');
		expect(diskText).toContain('line 999');
	});

	test('handles interleaved stdout and stderr to same file', async () => {
		const rawLogsFile = join(tmpdir(), `deploy-fork-test-interleaved-${Date.now()}.txt`);
		tempFiles.push(rawLogsFile);

		// Child writes to both stdout and stderr
		const proc = spawn({
			cmd: [
				'bun',
				'-e',
				`
				for(let i=0;i<500;i++){
					process.stdout.write('OUT:'+i+'\\n');
					process.stderr.write('ERR:'+i+'\\n');
				}
				`,
			],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const writer = createWriteStream(rawLogsFile);

		// Both streams write to the same file (mirrors deploy-fork.ts behaviour)
		const readStream = async (stream: ReadableStream<Uint8Array>) => {
			const reader = stream.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				writer.write(value);
			}
		};

		await Promise.all([
			readStream(proc.stdout as ReadableStream<Uint8Array>),
			readStream(proc.stderr as ReadableStream<Uint8Array>),
		]);

		await new Promise<void>((resolve) => writer.end(resolve));
		await proc.exited;

		const content = readFileSync(rawLogsFile, 'utf-8');

		// Both stdout and stderr lines must be present
		expect(content).toContain('OUT:0');
		expect(content).toContain('OUT:499');
		expect(content).toContain('ERR:0');
		expect(content).toContain('ERR:499');
	});

	test('silent child output produces empty file', async () => {
		const rawLogsFile = join(tmpdir(), `deploy-fork-test-empty-${Date.now()}.txt`);
		tempFiles.push(rawLogsFile);

		// Use process.exit(0) to guarantee zero stdout output
		const proc = spawn({
			cmd: ['bun', '-e', 'process.exit(0)'],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const captured = await captureStreamToFile(
			proc.stdout as ReadableStream<Uint8Array>,
			rawLogsFile
		);
		await proc.exited;

		expect(existsSync(rawLogsFile)).toBe(true);
		expect(captured).toBe(0);
		expect(statSync(rawLogsFile).size).toBe(0);
	});
});
