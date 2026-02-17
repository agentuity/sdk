import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnWithTimeout } from './npm-availability';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// bun info requires a package.json in its cwd, and isVersionAvailableOnNpm
// uses tmpdir() as cwd. Ensure a minimal package.json exists there for tests.
const tmpPackageJson = join(tmpdir(), 'package.json');
let createdPackageJson = false;

beforeAll(async () => {
	const file = Bun.file(tmpPackageJson);
	if (!(await file.exists())) {
		await Bun.write(file, '{}');
		createdPackageJson = true;
	}
});

afterAll(async () => {
	if (createdPackageJson) {
		const { unlink } = await import('node:fs/promises');
		await unlink(tmpPackageJson).catch(() => {});
	}
});

test('spawnWithTimeout kills process on timeout', async () => {
	// spawn a command that hangs with a short timeout (500ms)
	await expect(
		spawnWithTimeout(['bun', '-e', 'setTimeout(()=>{},60000)'], { timeout: 500 })
	).rejects.toThrow(/timed out/);
});

test('spawnWithTimeout returns result when command completes in time', async () => {
	const result = await spawnWithTimeout(['bun', '-e', "console.log('hello')"], {
		timeout: 5_000,
	});
	expect(result.exitCode).toBe(0);
	expect(result.stdout.toString().trim()).toBe('hello');
});

test('spawnWithTimeout returns non-zero exit code without throwing', async () => {
	const result = await spawnWithTimeout(['bun', '-e', 'process.exit(1)'], { timeout: 5_000 });
	expect(result.exitCode).not.toBe(0);
});

test('isVersionAvailableOnNpm returns true for a known version', async () => {
	const { isVersionAvailableOnNpm } = await import('./npm-availability');
	// Use a known-good old version that definitely exists
	const result = await isVersionAvailableOnNpm('1.0.10');
	expect(result).toBe(true);
}, 15_000); // generous test timeout but the function itself has 10s subprocess timeout

test('isVersionAvailableOnNpm returns false for non-existent version', async () => {
	const { isVersionAvailableOnNpm } = await import('./npm-availability');
	const result = await isVersionAvailableOnNpm('999.999.999');
	expect(result).toBe(false);
}, 15_000);
