import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
		if (out && existsSync(out)) rmSync(out, { force: true });
	});

	test('adds files and reports entries via onEntry', async () => {
		root = makeTmp('zip-src');
		out = join(makeTmp('zip-out'), 'pack.zip');
		writeFileSync(join(root, 'a.txt'), 'hello');
		writeFileSync(join(root, 'b.txt'), 'world');
		mkdirSync(join(root, 'nested'), { recursive: true });
		writeFileSync(join(root, 'nested', 'c.txt'), 'nested');

		const entries: ZipEntryInfo[] = [];
		const result = await zipDir(root, out, {
			onEntry: (info) => entries.push(info),
			filter: (_f, rel) => rel !== 'b.txt',
		});

		expect(result.added).toBe(2);
		expect(result.skipped).toBeGreaterThanOrEqual(1);
		expect(existsSync(out)).toBe(true);
		expect(entries.some((e) => e.action === 'add' && e.relative === 'a.txt')).toBe(true);
		expect(entries.some((e) => e.action === 'add' && e.relative === 'nested/c.txt')).toBe(true);
		expect(entries.some((e) => e.action === 'skip-filter' && e.relative === 'b.txt')).toBe(true);
		// Zip is a real archive (PK signature).
		const header = readFileSync(out).subarray(0, 2);
		expect(header[0]).toBe(0x50); // P
		expect(header[1]).toBe(0x4b); // K
	});
});
