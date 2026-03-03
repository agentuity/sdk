import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { formatBuildLog } from '../../../../src/cmd/build/vite/server-bundler';

describe('Build Error Formatting', () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'build-error-test-'));
	});

	afterAll(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('formatBuildLog', () => {
		test('formats ResolveMessage with specifier and referrer', async () => {
			const srcDir = join(tempDir, 'resolve-test');
			await mkdir(srcDir, { recursive: true });

			await Bun.write(
				join(srcDir, 'entry.ts'),
				`import { something } from 'non-existent-package-xyz123';
export const x = something;`
			);

			const result = await Bun.build({
				entrypoints: [join(srcDir, 'entry.ts')],
				outdir: join(srcDir, 'out'),
				throw: false,
			});

			expect(result.success).toBe(false);
			expect(result.logs.length).toBeGreaterThan(0);

			const resolveLog = result.logs.find((log) => log.name === 'ResolveMessage');
			expect(resolveLog).toBeDefined();

			const formatted = formatBuildLog(resolveLog!);
			expect(formatted).toContain('Could not resolve');
			expect(formatted).toContain('non-existent-package-xyz123');
			expect(formatted).toContain('imported from:');
			expect(formatted).toContain('entry.ts');
		});

		test('formats BuildMessage with syntax error', async () => {
			const srcDir = join(tempDir, 'syntax-test');
			await mkdir(srcDir, { recursive: true });

			await Bun.write(
				join(srcDir, 'entry.ts'),
				`export const x = {
	foo: 'bar'
	missing: 'comma'
};`
			);

			const result = await Bun.build({
				entrypoints: [join(srcDir, 'entry.ts')],
				outdir: join(srcDir, 'out'),
				throw: false,
			});

			expect(result.success).toBe(false);
			expect(result.logs.length).toBeGreaterThan(0);

			const buildLog = result.logs[0];
			const formatted = formatBuildLog(buildLog);

			expect(formatted.length).toBeGreaterThan(0);
			if (buildLog.position) {
				expect(formatted).toContain('at');
				expect(formatted).toContain('entry.ts');
			}
		});

		test('formats multiple errors correctly', async () => {
			const srcDir = join(tempDir, 'multi-error-test');
			await mkdir(srcDir, { recursive: true });

			await Bun.write(
				join(srcDir, 'entry.ts'),
				`import { a } from 'missing-pkg-a';
import { b } from 'missing-pkg-b';
import { c } from 'missing-pkg-c';
export const result = a + b + c;`
			);

			const result = await Bun.build({
				entrypoints: [join(srcDir, 'entry.ts')],
				outdir: join(srcDir, 'out'),
				throw: false,
			});

			expect(result.success).toBe(false);
			expect(result.logs.length).toBeGreaterThan(0);

			const formattedErrors = result.logs.map((log) => formatBuildLog(log)).filter(Boolean);

			expect(formattedErrors.length).toBeGreaterThan(0);

			for (const formatted of formattedErrors) {
				expect(formatted).not.toContain('ResolveMessage {}');
				expect(formatted).not.toContain('[object Object]');
			}
		});

		test('handles empty message gracefully', () => {
			const emptyLog = {
				name: 'BuildMessage' as const,
				message: '',
				position: null,
				level: 'error' as const,
			};

			const formatted = formatBuildLog(emptyLog);
			expect(formatted).toBe('');
		});

		test('includes position info when available', () => {
			const logWithPosition = {
				name: 'BuildMessage' as const,
				message: 'Test error',
				position: {
					file: '/path/to/file.ts',
					line: 10,
					column: 5,
					lineText: 'const x = bad;',
					offset: 0,
					length: 3,
				},
				level: 'error' as const,
			};

			const formatted = formatBuildLog(logWithPosition);
			expect(formatted).toContain('Test error');
			expect(formatted).toContain('at /path/to/file.ts:10:5');
		});

		test('formats ResolveMessage without referrer', () => {
			const resolveLog = {
				name: 'ResolveMessage' as const,
				specifier: 'some-module',
				referrer: '',
				message: '',
				position: null,
				code: '',
				importKind: 'import' as const,
				level: 'error' as const,
			};

			const formatted = formatBuildLog(resolveLog);
			expect(formatted).toContain('Could not resolve "some-module"');
			expect(formatted).not.toContain('imported from:');
		});
	});

	describe('AggregateError handling', () => {
		test('real Bun.build produces formatted errors on module resolution failure', async () => {
			const srcDir = join(tempDir, 'aggregate-test');
			await mkdir(srcDir, { recursive: true });

			await Bun.write(
				join(srcDir, 'entry.ts'),
				`import { foo } from 'definitely-not-a-real-package-12345';
export default foo;`
			);

			const result = await Bun.build({
				entrypoints: [join(srcDir, 'entry.ts')],
				outdir: join(srcDir, 'out'),
				throw: false,
			});

			expect(result.success).toBe(false);

			const errorMessages = result.logs
				.map((log) => formatBuildLog(log))
				.filter(Boolean)
				.join('\n');

			expect(errorMessages).not.toBe('');
			expect(errorMessages).not.toContain('ResolveMessage {}');
			expect(errorMessages).toContain('definitely-not-a-real-package-12345');
		});
	});
});
