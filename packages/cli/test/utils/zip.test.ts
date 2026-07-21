import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipDir, type ZipEntryInfo } from '../../src/utils/zip';

function makeTmp(prefix: string): string {
	const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('zipDir', () => {
	let root: string;
	let out: string;
	let outDir: string;

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
		if (outDir) rmSync(outDir, { recursive: true, force: true });
	});

	test('adds files and reports filter, symlink, and directory skips via onEntry', async () => {
		root = makeTmp('zip-src');
		outDir = makeTmp('zip-out');
		out = join(outDir, 'pack.zip');
		writeFileSync(join(root, 'a.txt'), 'hello');
		writeFileSync(join(root, 'b.txt'), 'world');
		mkdirSync(join(root, 'nested'), { recursive: true });
		writeFileSync(join(root, 'nested', 'c.txt'), 'nested');
		symlinkSync('a.txt', join(root, 'link.txt'));
		mkdirSync(join(root, 'empty-dir'), { recursive: true });

		const entries: ZipEntryInfo[] = [];
		const result = await zipDir(root, out, {
			onEntry: (info) => entries.push(info),
			filter: (_f, rel) => rel !== 'b.txt',
		});

		expect(existsSync(out)).toBe(true);
		expect(entries.some((e) => e.action === 'add' && e.relative === 'a.txt')).toBe(true);
		expect(entries.some((e) => e.action === 'add' && e.relative === 'nested/c.txt')).toBe(true);
		expect(entries.some((e) => e.action === 'skip-filter' && e.relative === 'b.txt')).toBe(true);
		expect(entries.some((e) => e.action === 'skip-symlink' && e.relative === 'link.txt')).toBe(
			true
		);
		expect(entries.some((e) => e.action === 'skip-directory' && e.relative === 'nested')).toBe(
			true
		);
		expect(entries.some((e) => e.action === 'skip-directory' && e.relative === 'empty-dir')).toBe(
			true
		);

		// b.txt (filter) + link.txt (symlink) + nested + empty-dir (directories)
		expect(result.skipped).toBe(4);
		expect(result.added).toBe(2);

		const header = readFileSync(out).subarray(0, 2);
		expect(header[0]).toBe(0x50); // P
		expect(header[1]).toBe(0x4b); // K
	});

	test('propagates onEntry callback errors without wrapping', async () => {
		root = makeTmp('zip-src-err');
		outDir = makeTmp('zip-out-err');
		out = join(outDir, 'pack.zip');
		writeFileSync(join(root, 'a.txt'), 'hello');

		await expect(
			zipDir(root, out, {
				onEntry: () => {
					throw new Error('callback-boom');
				},
			})
		).rejects.toThrow('callback-boom');
	});
});
