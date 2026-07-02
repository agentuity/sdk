import { describe, test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APIClient } from '../../../src/api';
import { importSubcommand } from '../../../src/cmd/project/import';
import type { AuthData, Config, Logger } from '../../../src/types';

type ImportContext = Parameters<typeof importSubcommand.handler>[0];

function makeLogger(): Logger {
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
	return logger;
}

describe('project import', () => {
	describe('importSubcommand definition', () => {
		test('should have correct name', () => {
			expect(importSubcommand.name).toBe('import');
		});

		test('should have description', () => {
			expect(importSubcommand.description).toBeTruthy();
			expect(importSubcommand.description).toContain('Import');
		});

		test('should require auth', () => {
			expect(importSubcommand.requires?.auth).toBe(true);
		});

		test('should require apiClient', () => {
			expect(importSubcommand.requires?.apiClient).toBe(true);
		});

		test('should have optional region', () => {
			expect(importSubcommand.optional?.region).toBe(true);
		});

		test('should have mutating tag', () => {
			expect(importSubcommand.tags).toContain('mutating');
		});

		test('should have creates-resource tag', () => {
			expect(importSubcommand.tags).toContain('creates-resource');
		});

		test('should have requires-auth tag', () => {
			expect(importSubcommand.tags).toContain('requires-auth');
		});

		test('should have dir option in schema', () => {
			expect(importSubcommand.schema?.options).toBeDefined();
		});

		test('should accept a project name in schema', () => {
			const options = importSubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('import options schema is missing');
			}

			const result = options.safeParse({
				name: 'My Imported Project',
			});

			expect(result.success).toBe(true);
		});

		test('should accept an existing project id in schema', () => {
			const options = importSubcommand.schema?.options;
			expect(options).toBeDefined();
			if (!options) {
				throw new Error('import options schema is missing');
			}

			const result = options.safeParse({
				projectId: 'proj_existing',
			});

			expect(result.success).toBe(true);
		});

		test('should have response schema with success', () => {
			expect(importSubcommand.schema?.response).toBeDefined();
		});

		test('should have examples', () => {
			expect(importSubcommand.examples).toBeDefined();
			expect(importSubcommand.examples?.length).toBeGreaterThan(0);
		});
	});

	describe('handler', () => {
		test('forwards an existing project id into local import', async () => {
			const testDir = mkdtempSync(join(tmpdir(), 'agentuity-project-import-test-'));
			try {
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

				const result = await importSubcommand.handler({
					opts: {
						dir: testDir,
						confirm: true,
						projectId: 'proj_existing',
					},
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
					logger: makeLogger(),
					options: {
						logLevel: 'info',
					},
					orgId: 'org_team',
					region: 'use',
					getExecutingAgent: () => undefined,
				} satisfies ImportContext);

				expect(result).toMatchObject({
					success: true,
					projectId: 'proj_existing',
					orgId: 'org_team',
					region: 'use',
					status: 'imported',
				});
				expect(requestedUrls).toEqual([
					'/cli/project/proj_existing?mask=false&includeProjectKeys=true',
				]);
				expect(readFileSync(join(testDir, '.env'), 'utf8')).toContain(
					'AGENTUITY_SDK_KEY=sdk_existing'
				);
				expect(JSON.parse(readFileSync(join(testDir, 'agentuity.json'), 'utf8'))).toMatchObject(
					{
						projectId: 'proj_existing',
						orgId: 'org_team',
						region: 'use',
					}
				);
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		});
	});
});
