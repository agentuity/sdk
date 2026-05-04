import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepOldGravityVersions } from '../../../src/cmd/dev/download';

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'agentuity-gravity-sweep-'));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('sweepOldGravityVersions', () => {
	test('removes old version directories that contain a gravity binary', () => {
		const gravityDir = makeTempDir();

		for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
			const versionDir = join(gravityDir, version);
			mkdirSync(versionDir, { recursive: true });
			writeFileSync(join(versionDir, 'gravity'), 'binary');
		}

		const removed = sweepOldGravityVersions(gravityDir, '1.2.0');

		expect(removed.sort()).toEqual([join(gravityDir, '1.0.0'), join(gravityDir, '1.1.0')]);
		expect(existsSync(join(gravityDir, '1.0.0', 'gravity'))).toBe(false);
		expect(existsSync(join(gravityDir, '1.1.0', 'gravity'))).toBe(false);
		expect(existsSync(join(gravityDir, '1.2.0', 'gravity'))).toBe(true);
	});

	test('leaves unrelated directories and files untouched', () => {
		const gravityDir = makeTempDir();

		mkdirSync(join(gravityDir, '1.0.0'), { recursive: true });
		writeFileSync(join(gravityDir, '1.0.0', 'gravity'), 'binary');
		mkdirSync(join(gravityDir, '1.1.0'), { recursive: true });
		writeFileSync(join(gravityDir, '1.1.0', 'gravity'), 'binary');
		mkdirSync(join(gravityDir, 'notes'), { recursive: true });
		writeFileSync(join(gravityDir, 'notes', 'readme.txt'), 'keep me');
		writeFileSync(join(gravityDir, 'manifest.json'), '{}');

		const removed = sweepOldGravityVersions(gravityDir, '1.1.0');

		expect(removed).toEqual([join(gravityDir, '1.0.0')]);
		expect(existsSync(join(gravityDir, 'notes', 'readme.txt'))).toBe(true);
		expect(existsSync(join(gravityDir, 'manifest.json'))).toBe(true);
		expect(existsSync(join(gravityDir, '1.1.0', 'gravity'))).toBe(true);
	});
});
