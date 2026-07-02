import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Logger } from '@agentuity/core';
import type { APIClient } from '../../../src/api';
import type { AuthData, Config } from '../../../src/types';
import * as tui from '../../../src/tui';
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
		mock.restore();
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

		test('explicit project id uses the import command interactive default', async () => {
			// Stub the bind confirmation: without interactive/confirm set, the
			// import-command default (interactive) must reach tui.confirm rather
			// than erroring out. A real prompt would hang under a TTY stdin.
			const confirmSpy = spyOn(tui, 'confirm').mockResolvedValue(true);
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
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
				confirm: false,
				projectId: 'proj_existing',
			});

			expect(result.status).toBe('imported');
			expect(confirmSpy).toHaveBeenCalledWith(
				'Bind this directory to existing project proj_existing?',
				true
			);
			expect(requestedUrls).toEqual([
				'/cli/project/proj_existing?mask=false&includeProjectKeys=true',
			]);
			expect(JSON.parse(readFileSync(join(testDir, 'agentuity.json'), 'utf8'))).toMatchObject({
				projectId: 'proj_existing',
				orgId: 'org_team',
				region: 'use',
			});
		});

		test('explicit project id returns a structured error when the project fetch fails', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);

			const apiClient = {
				get: async () => {
					throw new Error('project not found');
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
				projectId: 'proj_missing',
			});

			expect(result.status).toBe('error');
			expect(result.message).toContain('proj_missing');
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('explicit project id requires confirmation before fetching or writing', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
				})
			);

			let apiCalled = false;
			const apiClient = {
				get: async () => {
					apiCalled = true;
					throw new Error('bind should not fetch before confirmation');
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
				confirm: false,
				projectId: 'proj_existing',
			});

			expect(result).toEqual({
				status: 'error',
				message: 'Project import requires interactive mode.',
			});
			expect(apiCalled).toBe(false);
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only with project id verifies the cloud project without writing files', async () => {
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
				validateOnly: true,
				projectId: 'proj_existing',
			});

			expect(result).toEqual({
				status: 'valid',
				message: 'Project structure is valid. Project access verified. No files were changed.',
			});
			expect(requestedUrls).toEqual([
				'/cli/project/proj_existing?mask=false&includeProjectKeys=true',
			]);
			expect(envUpdateCalled).toBe(false);
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only with project id fails when the project cannot be loaded', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);

			const apiClient = {
				get: async () => {
					throw new Error('project not found');
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
				validateOnly: true,
				projectId: 'proj_missing',
			});

			expect(result).toEqual({
				status: 'error',
				message:
					'Could not load project proj_missing. Check the project ID and your access, then try again.',
			});
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only with project id fails when the project has no SDK key', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);

			const apiClient = {
				get: async () => {
					return {
						success: true,
						data: {
							id: 'proj_nokey',
							name: 'Existing Project',
							orgId: 'org_team',
							cloudRegion: 'use',
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
				validateOnly: true,
				projectId: 'proj_nokey',
			});

			expect(result).toEqual({
				status: 'error',
				message: 'Could not load an SDK key for the selected project.',
			});
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only without project id stays local and writes nothing', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
					dependencies: {
						'@agentuity/sdk': '^1.0.0',
					},
				})
			);

			let apiCalled = false;
			const apiClient = {
				get: async () => {
					apiCalled = true;
					throw new Error('plain validate-only should not call the API');
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
				confirm: false,
				validateOnly: true,
			});

			expect(result).toEqual({
				status: 'valid',
				message: 'Project structure is valid. No files were changed.',
			});
			expect(apiCalled).toBe(false);
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only with project id rejects non-project directories', async () => {
			let apiCalled = false;
			const apiClient = {
				get: async () => {
					apiCalled = true;
					throw new Error('validate-only should not fetch the project');
				},
			} as unknown as APIClient;
			const logger = {
				child: () => logger,
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: (): void => {},
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
				validateOnly: true,
				projectId: 'proj_existing',
			});

			expect(result).toEqual({
				status: 'error',
				message:
					'Could not detect a deployable project. Expected a package.json with a build script (e.g. "build": "next build"), or a bare index.html for static HTML deploys.',
			});
			expect(apiCalled).toBe(false);
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('explicit project id rejects non-project directories before fetching or writing', async () => {
			let apiCalled = false;
			const apiClient = {
				get: async () => {
					apiCalled = true;
					throw new Error('bind should validate structure first');
				},
			} as unknown as APIClient;
			const logger = {
				child: () => logger,
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: (): void => {},
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
				status: 'error',
				message:
					'Could not detect a deployable project. Expected a package.json with a build script (e.g. "build": "next build"), or a bare index.html for static HTML deploys.',
			});
			expect(apiCalled).toBe(false);
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(existsSync(join(testDir, 'agentuity.json'))).toBe(false);
		});

		test('validate-only with a matching registered project does not prompt or write', async () => {
			const confirmSpy = spyOn(tui, 'confirm').mockResolvedValue(false);
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
				})
			);
			writeFileSync(
				join(testDir, 'agentuity.json'),
				JSON.stringify({
					projectId: 'proj_vmatch',
					orgId: 'org_team',
					region: 'use',
				})
			);

			const apiClient = {
				get: async (url: string) => {
					if (url.startsWith('/cli/organization')) {
						return { success: true, data: [{ id: 'org_team', name: 'Team' }] };
					}
					return {
						success: true,
						data: {
							id: 'proj_vmatch',
							name: 'Existing Project',
							orgId: 'org_team',
							cloudRegion: 'use',
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
					name: 'test-vmatch',
					preferences: {
						orgId: 'org_team',
					},
				} as unknown as Config,
				logger,
				validateOnly: true,
				projectId: 'proj_vmatch',
			});

			expect(result.status).toBe('valid');
			expect(confirmSpy).not.toHaveBeenCalled();
			expect(existsSync(join(testDir, '.env'))).toBe(false);
			expect(JSON.parse(readFileSync(join(testDir, 'agentuity.json'), 'utf8'))).toMatchObject({
				projectId: 'proj_vmatch',
			});
		});

		test('validate-only with a registered project without access fails without importing', async () => {
			const confirmSpy = spyOn(tui, 'confirm').mockResolvedValue(false);
			const selectOrgSpy = spyOn(tui, 'selectOrganization').mockImplementation(() => {
				throw new Error('validate-only must not prompt for an organization');
			});
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'existing-project-app',
				})
			);
			writeFileSync(
				join(testDir, 'agentuity.json'),
				JSON.stringify({
					projectId: 'proj_vnoaccess',
					orgId: 'org_other',
					region: 'use',
				})
			);

			const apiClient = {
				get: async (url: string) => {
					if (url.startsWith('/cli/organization')) {
						return { success: true, data: [{ id: 'org_team', name: 'Team' }] };
					}
					return {
						success: true,
						data: {
							id: 'proj_vnoaccess',
							name: 'Existing Project',
							orgId: 'org_other',
							cloudRegion: 'use',
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
					name: 'test-vnoaccess',
					preferences: {
						orgId: 'org_team',
					},
				} as unknown as Config,
				logger,
				validateOnly: true,
				projectId: 'proj_vnoaccess',
			});

			expect(result).toEqual({
				status: 'error',
				message:
					"You don't have access to this project. Run interactively to import it to your organization.",
			});
			expect(confirmSpy).not.toHaveBeenCalled();
			expect(selectOrgSpy).not.toHaveBeenCalled();
			expect(existsSync(join(testDir, '.env'))).toBe(false);
		});
	});
});
