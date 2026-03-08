import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyBundleFiles } from '../src/cmd/build/vite/bundle-files';
import type { Logger } from '../src/types';

let tempDir: string;
let outDir: string;
let warnings: string[];
let debugs: string[];

function createLogger(): Logger {
	warnings = [];
	debugs = [];
	const logger: Logger = {
		info: () => {},
		warn: (msg: unknown) => {
			warnings.push(String(msg));
		},
		error: () => {},
		debug: (msg: unknown) => {
			debugs.push(String(msg));
		},
		fatal: (() => {
			throw new Error('fatal called');
		}) as Logger['fatal'],
		trace: () => {},
		child: () => logger,
	};
	return logger;
}

beforeEach(() => {
	tempDir = join(tmpdir(), `bundle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	outDir = join(tempDir, 'out');
	mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

test('copies files matching a simple glob pattern', async () => {
	// Create test files
	mkdirSync(join(tempDir, 'data'), { recursive: true });
	writeFileSync(join(tempDir, 'data', 'a.json'), '{"a":1}');
	writeFileSync(join(tempDir, 'data', 'b.json'), '{"b":2}');

	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, ['data/*.json'], logger);

	expect(count).toBe(2);
	expect(existsSync(join(outDir, 'data', 'a.json'))).toBe(true);
	expect(existsSync(join(outDir, 'data', 'b.json'))).toBe(true);
	expect(readFileSync(join(outDir, 'data', 'a.json'), 'utf-8')).toBe('{"a":1}');
});

test('preserves nested directory structure', async () => {
	mkdirSync(join(tempDir, 'deep', 'nested', 'dir'), { recursive: true });
	writeFileSync(join(tempDir, 'deep', 'nested', 'dir', 'file.txt'), 'hello');

	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, ['deep/**'], logger);

	expect(count).toBe(1);
	expect(existsSync(join(outDir, 'deep', 'nested', 'dir', 'file.txt'))).toBe(true);
	expect(readFileSync(join(outDir, 'deep', 'nested', 'dir', 'file.txt'), 'utf-8')).toBe('hello');
});

test('handles multiple patterns', async () => {
	mkdirSync(join(tempDir, 'data'), { recursive: true });
	mkdirSync(join(tempDir, 'templates'), { recursive: true });
	writeFileSync(join(tempDir, 'data', 'file.csv'), 'a,b');
	writeFileSync(join(tempDir, 'templates', 'page.html'), '<html>');

	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, ['data/**', 'templates/**'], logger);

	expect(count).toBe(2);
	expect(existsSync(join(outDir, 'data', 'file.csv'))).toBe(true);
	expect(existsSync(join(outDir, 'templates', 'page.html'))).toBe(true);
});

test('excludes .agentuity/ directory', async () => {
	mkdirSync(join(tempDir, '.agentuity'), { recursive: true });
	mkdirSync(join(tempDir, 'src'), { recursive: true });
	writeFileSync(join(tempDir, '.agentuity', 'build.js'), 'build');
	writeFileSync(join(tempDir, 'src', 'index.ts'), 'code');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['**/*'], logger);

	expect(existsSync(join(outDir, 'src', 'index.ts'))).toBe(true);
	expect(existsSync(join(outDir, '.agentuity', 'build.js'))).toBe(false);
});

test('excludes node_modules/ directory', async () => {
	mkdirSync(join(tempDir, 'node_modules', 'pkg'), { recursive: true });
	mkdirSync(join(tempDir, 'lib'), { recursive: true });
	writeFileSync(join(tempDir, 'node_modules', 'pkg', 'index.js'), 'module');
	writeFileSync(join(tempDir, 'lib', 'util.ts'), 'util');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['**/*'], logger);

	expect(existsSync(join(outDir, 'lib', 'util.ts'))).toBe(true);
	expect(existsSync(join(outDir, 'node_modules', 'pkg', 'index.js'))).toBe(false);
});

test('warns when pattern matches no files', async () => {
	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, ['nonexistent/**'], logger);

	expect(count).toBe(0);
	expect(warnings.length).toBe(1);
	expect(warnings[0]).toContain("'nonexistent/**'");
	expect(warnings[0]).toContain('matched no files');
});

test('logs debug message for matched patterns', async () => {
	mkdirSync(join(tempDir, 'data'), { recursive: true });
	writeFileSync(join(tempDir, 'data', 'file.txt'), 'content');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['data/**'], logger);

	expect(debugs.some((d) => d.includes("'data/**'") && d.includes('1 file(s)'))).toBe(true);
});

test('returns zero for empty patterns array', async () => {
	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, [], logger);

	expect(count).toBe(0);
	expect(warnings.length).toBe(0);
});

test('excludes .env files at project root', async () => {
	writeFileSync(join(tempDir, '.env'), 'SECRET=abc');
	writeFileSync(join(tempDir, '.env.local'), 'LOCAL=xyz');
	writeFileSync(join(tempDir, '.env.production'), 'PROD=123');
	mkdirSync(join(tempDir, 'src'), { recursive: true });
	writeFileSync(join(tempDir, 'src', 'app.ts'), 'code');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['**/*'], logger);

	expect(existsSync(join(outDir, 'src', 'app.ts'))).toBe(true);
	expect(existsSync(join(outDir, '.env'))).toBe(false);
	expect(existsSync(join(outDir, '.env.local'))).toBe(false);
	expect(existsSync(join(outDir, '.env.production'))).toBe(false);
});

test('excludes .git/ directory', async () => {
	mkdirSync(join(tempDir, '.git', 'objects'), { recursive: true });
	mkdirSync(join(tempDir, 'src'), { recursive: true });
	writeFileSync(join(tempDir, '.git', 'config'), 'git config');
	writeFileSync(join(tempDir, '.git', 'objects', 'abc'), 'object');
	writeFileSync(join(tempDir, 'src', 'index.ts'), 'code');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['**/*'], logger);

	expect(existsSync(join(outDir, 'src', 'index.ts'))).toBe(true);
	expect(existsSync(join(outDir, '.git', 'config'))).toBe(false);
	expect(existsSync(join(outDir, '.git', 'objects', 'abc'))).toBe(false);
});

test('throws contextual error on copy failure', async () => {
	// Create a file that will be matched
	mkdirSync(join(tempDir, 'data'), { recursive: true });
	writeFileSync(join(tempDir, 'data', 'file.txt'), 'content');

	const logger = createLogger();

	// Create outDir so the initial mkdirSync succeeds, then place a regular
	// file where the per-file mkdirSync needs to create a directory.
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'data'), 'blocker');

	try {
		await copyBundleFiles(tempDir, outDir, ['data/**'], logger);
		expect(true).toBe(false); // Should not reach here
	} catch (err) {
		expect((err as Error).message).toContain('data/file.txt');
		expect((err as Error).message).toContain("'data/**'");
	}
});

test('filters out gitignored files', async () => {
	// Initialize a git repo in the temp directory
	Bun.spawnSync(['git', 'init'], { cwd: tempDir });
	Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: tempDir });
	Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: tempDir });

	// Create .gitignore that ignores build output
	writeFileSync(join(tempDir, '.gitignore'), 'dist/\n*.log\n');

	// Create files: some gitignored, some not
	mkdirSync(join(tempDir, 'dist'), { recursive: true });
	mkdirSync(join(tempDir, 'src'), { recursive: true });
	writeFileSync(join(tempDir, 'dist', 'bundle.js'), 'built');
	writeFileSync(join(tempDir, 'src', 'app.ts'), 'source');
	writeFileSync(join(tempDir, 'debug.log'), 'log content');
	writeFileSync(join(tempDir, 'readme.md'), 'hello');

	const logger = createLogger();
	await copyBundleFiles(tempDir, outDir, ['**/*'], logger);

	// src/app.ts and readme.md should be copied (not ignored)
	expect(existsSync(join(outDir, 'src', 'app.ts'))).toBe(true);
	expect(existsSync(join(outDir, 'readme.md'))).toBe(true);

	// dist/bundle.js and debug.log should NOT be copied (gitignored)
	expect(existsSync(join(outDir, 'dist', 'bundle.js'))).toBe(false);
	expect(existsSync(join(outDir, 'debug.log'))).toBe(false);

	// .gitignore itself is not hard-excluded, but it's a tracked file so it passes through
	// (it's fine to include .gitignore — it's harmless)
});

test('falls back gracefully when not a git repo', async () => {
	// tempDir is NOT a git repo — just a plain directory
	mkdirSync(join(tempDir, 'data'), { recursive: true });
	writeFileSync(join(tempDir, 'data', 'file.txt'), 'content');
	writeFileSync(join(tempDir, 'data', 'ignored.log'), 'should be included without git');

	const logger = createLogger();
	const count = await copyBundleFiles(tempDir, outDir, ['data/**'], logger);

	// Both files should be copied since there's no git to filter
	expect(count).toBe(2);
	expect(existsSync(join(outDir, 'data', 'file.txt'))).toBe(true);
	expect(existsSync(join(outDir, 'data', 'ignored.log'))).toBe(true);

	// Should have a debug log about not being a git repo
	expect(debugs.some((d) => d.includes('Not a git repository'))).toBe(true);
});
