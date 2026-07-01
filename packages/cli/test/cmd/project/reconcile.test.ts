import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Logger } from '@agentuity/core';
import type { APIClient } from '../../../src/api';
import type { AuthData, Config } from '../../../src/types';
import {
	isValidProjectStructure,
	getDefaultProjectName,
	resolveProjectRegistrationName,
	runProjectImport,
} from '../../../src/cmd/project/reconcile';

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
		test('should return true for project with dependencies', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						next: '^15.0.0',
					},
				})
			);

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return true for project with devDependencies', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					devDependencies: {
						vite: '^6.0.0',
					},
				})
			);

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return true for project with just a name', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
				})
			);

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return true for project with agentuity/ subdirectory containing package.json', async () => {
			const agentuityDir = join(testDir, 'agentuity');
			mkdirSync(agentuityDir, { recursive: true });
			writeFileSync(
				join(agentuityDir, 'package.json'),
				JSON.stringify({
					name: 'child-project',
					dependencies: {
						hono: '^4.0.0',
					},
				})
			);

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(true);
		});

		test('should return false for project with agentuity/ subdirectory but no package.json', async () => {
			const agentuityDir = join(testDir, 'agentuity');
			mkdirSync(agentuityDir, { recursive: true });

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false for empty directory', async () => {
			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json is missing', async () => {
			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json is invalid JSON', async () => {
			writeFileSync(join(testDir, 'package.json'), 'not valid json');

			const result = await isValidProjectStructure(testDir);
			expect(result).toBe(false);
		});

		test('should return false when package.json is empty object', async () => {
			writeFileSync(join(testDir, 'package.json'), JSON.stringify({}));

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

	describe('resolveProjectRegistrationName', () => {
		test('uses explicit name before package.json name', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'package-json-name',
				})
			);

			const result = await resolveProjectRegistrationName({
				dir: testDir,
				name: 'User Provided Name',
				confirm: true,
			});

			expect(result).toBe('User Provided Name');
		});

		test('trims explicit names', async () => {
			const result = await resolveProjectRegistrationName({
				dir: testDir,
				name: '  User Provided Name  ',
				confirm: true,
			});

			expect(result).toBe('User Provided Name');
		});

		test('rejects blank explicit names', async () => {
			await expect(
				resolveProjectRegistrationName({
					dir: testDir,
					name: '   ',
					confirm: true,
				})
			).rejects.toThrow('Project name is required.');
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

	describe('runProjectImport', () => {
		test('binds a local project to an existing project id', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);

			const requestedUrls: string[] = [];
			let envUpdateCalled = false;
			const apiClient = {
				get: async (url: string) => {
					requestedUrls.push(url);
					return {
						success: true,
						data: {
							id: 'proj_existing',
							name: 'Existing Project',
							orgId: 'org_team',
							cloudRegion: 'use',
							secrets: {
								AGENTUITY_SDK_KEY: 'sdk_existing',
							},
						},
					};
				},
				request: async () => {
					envUpdateCalled = true;
					return { success: true, data: undefined };
				},
			} as unknown as APIClient;
			const logger = {
				child: () => logger,
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('fatal');
				},
			} satisfies Logger;

			const result = await runProjectImport({
				dir: testDir,
				auth: {
					apiKey: 'ag_test',
					userId: 'usr_test',
					expires: new Date(Date.now() + 60_000),
				} satisfies AuthData,
				apiClient,
				config: {
					name: 'test',
					preferences: {
						orgId: 'org_team',
					},
				} as unknown as Config,
				logger,
				interactive: false,
				confirm: true,
				projectId: 'proj_existing',
			});

			expect(result).toEqual({
				status: 'imported',
				project: {
					projectId: 'proj_existing',
					orgId: 'org_team',
					region: 'use',
				},
			});
			expect(requestedUrls).toEqual([
				'/cli/project/proj_existing?mask=false&includeProjectKeys=true',
			]);
			expect(envUpdateCalled).toBe(false);
			expect(readFileSync(join(testDir, '.env'), 'utf8')).toContain(
				'AGENTUITY_SDK_KEY=sdk_existing'
			);
			expect(JSON.parse(readFileSync(join(testDir, 'agentuity.json'), 'utf8'))).toMatchObject({
				projectId: 'proj_existing',
				orgId: 'org_team',
				region: 'use',
			});
		});

		test('explicit project id overrides a different existing local config', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);
			writeFileSync(
				join(testDir, 'agentuity.json'),
				JSON.stringify({
					projectId: 'proj_stale',
					orgId: 'org_team',
					region: 'use',
				})
			);

			const requestedUrls: string[] = [];
			const apiClient = {
				get: async (url: string) => {
					requestedUrls.push(url);
					return {
						success: true,
						data: {
							id: 'proj_existing',
							name: 'Existing Project',
							orgId: 'org_team',
							cloudRegion: 'use',
							secrets: {
								AGENTUITY_SDK_KEY: 'sdk_existing',
							},
						},
					};
				},
			} as unknown as APIClient;
			const logger = {
				child: () => logger,
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
				fatal: (): never => {
					throw new Error('fatal');
				},
			} satisfies Logger;

			const result = await runProjectImport({
				dir: testDir,
				auth: {
					apiKey: 'ag_test',
					userId: 'usr_test',
					expires: new Date(Date.now() + 60_000),
				} satisfies AuthData,
				apiClient,
				config: {
					name: 'test',
					preferences: {
						orgId: 'org_team',
					},
				} as unknown as Config,
				logger,
				interactive: false,
				confirm: true,
				projectId: 'proj_existing',
			});

			expect(result.status).toBe('imported');
			expect(requestedUrls).toEqual([
				'/cli/project/proj_existing?mask=false&includeProjectKeys=true',
			]);
			expect(JSON.parse(readFileSync(join(testDir, 'agentuity.json'), 'utf8'))).toMatchObject({
				projectId: 'proj_existing',
				orgId: 'org_team',
				region: 'use',
			});
		});
	});
});
