import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideNoFrameworkHit, isDirEmptyForScaffold } from '../../../src/cmd/project/create';

describe('isDirEmptyForScaffold', () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `create-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('returns true for a missing directory', () => {
		rmSync(dir, { recursive: true, force: true });
		expect(isDirEmptyForScaffold(dir)).toBe(true);
	});

	test('returns true for a completely empty directory', () => {
		expect(isDirEmptyForScaffold(dir)).toBe(true);
	});

	test('treats `git init`-only dir as empty', () => {
		mkdirSync(join(dir, '.git'), { recursive: true });
		writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
		expect(isDirEmptyForScaffold(dir)).toBe(true);
	});

	test('treats editor metadata as empty', () => {
		mkdirSync(join(dir, '.vscode'));
		writeFileSync(join(dir, '.DS_Store'), '');
		expect(isDirEmptyForScaffold(dir)).toBe(true);
	});

	test('returns false when a package.json exists', () => {
		writeFileSync(join(dir, 'package.json'), '{}');
		expect(isDirEmptyForScaffold(dir)).toBe(false);
	});

	test('returns false for any non-ignored file', () => {
		writeFileSync(join(dir, 'README.md'), '# hi');
		expect(isDirEmptyForScaffold(dir)).toBe(false);
	});

	test('returns false when an unknown dotfile is present', () => {
		writeFileSync(join(dir, '.envrc'), 'export FOO=1\n');
		expect(isDirEmptyForScaffold(dir)).toBe(false);
	});
});

describe('decideNoFrameworkHit', () => {
	test('interactive run falls through to scaffold a new subdirectory', () => {
		expect(decideNoFrameworkHit({ isInteractive: true })).toBe('scaffold-subdir');
	});

	test('non-interactive run refuses with a fatal so callers must pass --name or use an empty dir', () => {
		expect(decideNoFrameworkHit({ isInteractive: false })).toBe('fatal');
	});
});
