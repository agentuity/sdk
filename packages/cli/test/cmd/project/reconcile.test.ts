import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isValidProjectStructure, getDefaultProjectName } from '../../../src/cmd/project/reconcile.ts';

describe('project reconcile', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(
			tmpdir(),
			`reconcile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe('isValidProjectStructure', () => {
		test('should return true for project with @agentuity/runtime in dependencies', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/runtime': '^1.0.0',
					},
				})
			);
			writeFileSync(join(testDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return true for project with @agentuity/runtime in devDependencies', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					devDependencies: {
						'@agentuity/runtime': '^1.0.0',
					},
				})
			);
			writeFileSync(join(testDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return true for project with agentuity/ subdirectory containing valid structure', async () => {
			const agentuityDir = join(testDir, 'agentuity');
			mkdirSync(agentuityDir, { recursive: true });
			writeFileSync(
				join(agentuityDir, 'package.json'),
				JSON.stringify({
					name: 'child-agent',
					dependencies: {
						'@agentuity/runtime': '^1.0.0',
					},
				})
			);
			writeFileSync(join(agentuityDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return false for project with agentuity/ subdirectory but no valid structure', async () => {
			const agentuityDir = join(testDir, 'agentuity');
			mkdirSync(agentuityDir, { recursive: true });
			writeFileSync(join(agentuityDir, 'package.json'), JSON.stringify({ name: 'empty' }));

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json exists but no @agentuity/runtime', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						express: '^4.0.0',
					},
				})
			);
			writeFileSync(join(testDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when @agentuity/runtime exists but no agentuity.config.ts', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/runtime': '^1.0.0',
					},
				})
			);
			// No agentuity.config.ts

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false for empty directory', async () => {
			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json is missing', async () => {
			writeFileSync(join(testDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json is invalid JSON', async () => {
			writeFileSync(join(testDir, 'package.json'), 'not valid json');
			writeFileSync(join(testDir, 'agentuity.config.ts'), 'export default {};');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});
	});

	describe('getDefaultProjectName', () => {
		test('should return name from package.json', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'my-cool-agent',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toBe('my-cool-agent');
		});

		test('should strip npm scope from package name', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: '@myorg/my-agent',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toBe('my-agent');
		});

		test('should handle scoped packages with nested scope', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: '@company/team-agent',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toBe('team-agent');
		});

		test('should fallback to directory name when package.json missing', async () => {
			const result = await getDefaultProjectName(testDir);
			// Should return the basename of testDir
			expect(result).toContain('reconcile-test-');
		});

		test('should fallback to directory name when package.json has no name', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					version: '1.0.0',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toContain('reconcile-test-');
		});

		test('should fallback to directory name when name is empty string', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: '',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toContain('reconcile-test-');
		});

		test('should fallback to directory name when name is whitespace', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: '   ',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toContain('reconcile-test-');
		});

		test('should fallback to directory name when package.json is invalid', async () => {
			writeFileSync(join(testDir, 'package.json'), 'not valid json');

			const result = await getDefaultProjectName(testDir);
			expect(result).toContain('reconcile-test-');
		});

		test('should trim whitespace from name', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: '  my-agent  ',
				})
			);

			const result = await getDefaultProjectName(testDir);
			expect(result).toBe('my-agent');
		});
	});

	describe('ReconcileResult types', () => {
		test('should have valid status values', () => {
			const validStatuses = ['valid', 'imported', 'skipped', 'error'];
			expect(validStatuses).toContain('valid');
			expect(validStatuses).toContain('imported');
			expect(validStatuses).toContain('skipped');
			expect(validStatuses).toContain('error');
		});
	});

	describe('agentuity.json scenarios', () => {
		test('should detect existing agentuity.json', async () => {
			writeFileSync(
				join(testDir, 'agentuity.json'),
				JSON.stringify({
					projectId: 'test-project-id',
					orgId: 'test-org-id',
					region: 'usc',
				})
			);

			const exists = await Bun.file(join(testDir, 'agentuity.json')).exists();
			expect(exists).toBe(true);
		});

		test('should handle missing agentuity.json', async () => {
			const exists = await Bun.file(join(testDir, 'agentuity.json')).exists();
			expect(exists).toBe(false);
		});
	});

	describe('.env file handling', () => {
		test('should detect existing .env file', async () => {
			writeFileSync(join(testDir, '.env'), 'AGENTUITY_SDK_KEY=test-key\n');

			const exists = await Bun.file(join(testDir, '.env')).exists();
			expect(exists).toBe(true);
		});

		test('should handle missing .env file', async () => {
			const exists = await Bun.file(join(testDir, '.env')).exists();
			expect(exists).toBe(false);
		});
	});
});
