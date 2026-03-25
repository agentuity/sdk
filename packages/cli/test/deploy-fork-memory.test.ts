/**
 * Stress test for deploy-fork output streaming.
 *
 * Validates the fix for the Bun crash (ERR_STRING_TOO_LONG / Illegal
 * Instruction) by verifying:
 *
 * 1. The fixed file-streaming approach correctly captures large output to disk
 *    without holding it in a single string (which caused the original crash
 *    when the string exceeded ~2 GB).
 *
 * 2. The captured file is usable as a Bun.file() Blob for streaming uploads
 *    to Pulse — again without loading the file into memory.
 *
 * 3. The old in-memory pattern accumulates the entire output as a string,
 *    confirming it would eventually hit ERR_STRING_TOO_LONG on large builds.
 */
import { describe, test, expect, afterEach } from 'bun:test';
import { spawn } from 'bun';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureStreamToFile } from '../src/utils/stream-capture';

describe('deploy-fork memory safety', () => {
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

	test('file-streaming captures large child output without building a string', async () => {
		// ~50 MB of output — large enough to be meaningful, small enough for CI.
		const targetMB = 50;
		const lineSize = 200;
		const lineCount = Math.ceil((targetMB * 1024 * 1024) / lineSize);

		const rawLogsFile = join(tmpdir(), `deploy-fork-stress-${Date.now()}.txt`);
		tempFiles.push(rawLogsFile);

		// Spawn a child that outputs ~50 MB to stdout
		const proc = spawn({
			cmd: [
				'bun',
				'-e',
				`const line = 'A'.repeat(${lineSize - 1}) + '\\n';
					 for(let i = 0; i < ${lineCount}; i++) process.stdout.write(line);`,
			],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// FIXED approach: stream raw bytes to a WriteStream on disk.
		// No string accumulation, no TextDecoder — just raw Uint8Array to file.
		const totalBytes = await captureStreamToFile(
			proc.stdout as ReadableStream<Uint8Array>,
			rawLogsFile
		);
		await proc.exited;

		// ── Data integrity: every byte made it to disk ───────────────
		const fileSize = statSync(rawLogsFile).size;
		expect(fileSize).toBe(totalBytes);
		expect(fileSize).toBeGreaterThan(targetMB * 1024 * 1024 * 0.9);

		// ── Bun.file() works for streaming upload to Pulse ───────────
		const bunFile = Bun.file(rawLogsFile);
		expect(bunFile.size).toBe(fileSize);

		// Bun.file() implements Blob, so it's usable as a fetch() body.
		// Verify we can get a ReadableStream from it without loading
		// the full content into a JS string.
		const stream = bunFile.stream();
		expect(stream).toBeInstanceOf(ReadableStream);

		// Read the first few bytes to prove the stream works
		const streamReader = stream.getReader();
		const { value: firstChunk, done: firstDone } = await streamReader.read();
		expect(firstDone).toBe(false);
		expect(firstChunk!.byteLength).toBeGreaterThan(0);
		streamReader.releaseLock();
	}, 30_000);

	test('old string-accumulation pattern holds entire output in memory', async () => {
		// Smaller size for this comparison since we intentionally accumulate in memory
		const targetMB = 20;
		const lineSize = 200;
		const lineCount = Math.ceil((targetMB * 1024 * 1024) / lineSize);

		const proc = spawn({
			cmd: [
				'bun',
				'-e',
				`const line = 'B'.repeat(${lineSize - 1}) + '\\n';
					 for(let i = 0; i < ${lineCount}; i++) process.stdout.write(line);`,
			],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// OLD pattern: accumulate everything in a string (this is the bug)
		const decoder = new TextDecoder();
		let outputBuffer = '';
		const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const text = decoder.decode(value, { stream: true });
			outputBuffer += text;
		}

		await proc.exited;

		// The string accumulated the entire output.  At ~20 MB this is fine,
		// but at >2 GB (as seen in the original crash) this would cause
		// Buffer.prototype.toString() → ERR_STRING_TOO_LONG → OOM → SIGILL.
		expect(outputBuffer.length).toBeGreaterThan(targetMB * 1024 * 1024 * 0.9);

		// Clean up the large string
		outputBuffer = '';
	}, 30_000);
});
