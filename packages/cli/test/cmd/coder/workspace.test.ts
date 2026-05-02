import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceCommand } from '../../../src/cmd/coder/workspace';
import { createWorkspaceSubcommand } from '../../../src/cmd/coder/workspace/create';
import { refreshWorkspaceSnapshotSubcommand } from '../../../src/cmd/coder/workspace/refresh';
import { updateWorkspaceSubcommand } from '../../../src/cmd/coder/workspace/update';
import { validateWorkspaceDependenciesSubcommand } from '../../../src/cmd/coder/workspace/validate-dependencies';
import { ErrorCode, getExitCode } from '../../../src/errors';

const ORIGINAL_EXIT = process.exit;
const ORIGINAL_STDERR_WRITE = process.stderr.write;
const ORIGINAL_FETCH = globalThis.fetch;

function makeContext(
	input: { args?: Record<string, unknown>; opts?: Record<string, unknown>; json?: boolean } = {}
) {
	return {
		args: { name: 'My Workspace', ...input.args },
		opts: {
			url: 'https://coder.example',
			...input.opts,
		},
		options: { json: input.json ?? false },
		auth: { apiKey: 'ag_test' },
		orgId: 'org_test',
		config: null,
		logger: {
			trace() {},
		},
		getExecutingAgent: () => 'codex',
	} as any;
}

function interceptFatal() {
	let stderr = '';
	let exitCode: number | undefined;

	process.stderr.write = ((chunk: string | Uint8Array) => {
		stderr += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	process.exit = ((code?: number) => {
		exitCode = code;
		throw new Error('__EXIT__');
	}) as typeof process.exit;

	return {
		get stderr() {
			return stderr;
		},
		get exitCode() {
			return exitCode;
		},
	};
}

function makeWorkspace(overrides: Record<string, unknown> = {}) {
	return {
		id: 'ws_test',
		name: 'My Workspace',
		description: 'Workspace description',
		scope: 'org',
		ownerUserId: 'user_test',
		repos: [],
		repoCount: 0,
		dependencies: [],
		setupScript: '',
		savedSkillIds: [],
		skillBucketIds: [],
		enabledAgents: [],
		selectionCount: 0,
		createdAt: '2026-04-08T00:00:00.000Z',
		updatedAt: '2026-04-08T00:00:00.000Z',
		...overrides,
	};
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('coder workspace commands', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		process.exit = ORIGINAL_EXIT;
		process.stderr.write = ORIGINAL_STDERR_WRITE;
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('create examples only advertise valid non-empty workspaces', () => {
		const rootCreateExamples =
			workspaceCommand.examples?.filter((example) =>
				example.command.includes('workspace create')
			) ?? [];
		const createExamples = createWorkspaceSubcommand.examples ?? [];

		expect(rootCreateExamples).toHaveLength(1);
		for (const example of [...rootCreateExamples, ...createExamples]) {
			const hasValidSelection =
				example.command.includes('--repo') ||
				example.command.includes('--dependency') ||
				example.command.includes('--setup-script') ||
				example.command.includes('--setup-script-file') ||
				example.command.includes('--enabled-agents');
			expect(hasValidSelection).toBe(true);
		}
		expect(createExamples.some((example) => example.command.includes('--enabled-agents'))).toBe(
			true
		);
		expect(createExamples.some((example) => example.command.includes('--dependency'))).toBe(true);
	});

	test('create handler fails locally before fetch when no selections are provided', async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			requestedUrls.push(String(url));
			throw new Error('unexpected fetch');
		}) as typeof globalThis.fetch;
		const fatal = interceptFatal();

		await expect(createWorkspaceSubcommand.handler(makeContext())).rejects.toThrow('__EXIT__');

		expect(requestedUrls).toEqual([]);
		expect(fatal.stderr).toContain(
			'Failed to create workspace: A workspace needs at least one repo, dependency, setup script, saved skill, skill bucket, or agent. Use --repo, --dependency, --setup-script, or --enabled-agents.'
		);
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});

	test('create handler sends dependencies from --dependency', async () => {
		let requestBody: unknown;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe('https://coder.example/api/hub/workspaces');
			expect(init?.method).toBe('POST');
			requestBody = JSON.parse(String(init?.body));
			return jsonResponse({
				workspace: makeWorkspace({
					dependencies: ['git', 'nodejs'],
					selectionCount: 2,
				}),
			});
		}) as typeof globalThis.fetch;

		const result = await createWorkspaceSubcommand.handler(
			makeContext({ opts: { dependency: 'git,nodejs' }, json: true })
		);

		expect(requestBody).toMatchObject({
			name: 'My Workspace',
			dependencies: ['git', 'nodejs'],
		});
		expect(result).toMatchObject({
			dependencies: ['git', 'nodejs'],
		});
	});

	test('create handler sends inline setup script', async () => {
		let requestBody: unknown;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe('https://coder.example/api/hub/workspaces');
			expect(init?.method).toBe('POST');
			requestBody = JSON.parse(String(init?.body));
			return jsonResponse({
				workspace: makeWorkspace({
					setupScript: 'echo ready',
					selectionCount: 1,
				}),
			});
		}) as typeof globalThis.fetch;

		const result = await createWorkspaceSubcommand.handler(
			makeContext({ opts: { setupScript: 'echo ready' }, json: true })
		);

		expect(requestBody).toMatchObject({
			name: 'My Workspace',
			setupScript: 'echo ready',
		});
		expect(result).toMatchObject({
			setupScript: 'echo ready',
		});
	});

	test('create handler reads setup script from file', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agentuity-workspace-test-'));
		const setupScriptFile = join(dir, 'setup.sh');
		writeFileSync(setupScriptFile, 'echo from-file\n');
		let requestBody: unknown;
		try {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				expect(String(url)).toBe('https://coder.example/api/hub/workspaces');
				expect(init?.method).toBe('POST');
				requestBody = JSON.parse(String(init?.body));
				return jsonResponse({
					workspace: makeWorkspace({
						setupScript: 'echo from-file\n',
						selectionCount: 1,
					}),
				});
			}) as typeof globalThis.fetch;

			const result = await createWorkspaceSubcommand.handler(
				makeContext({ opts: { setupScriptFile }, json: true })
			);

			expect(requestBody).toMatchObject({
				name: 'My Workspace',
				setupScript: 'echo from-file\n',
			});
			expect(result).toMatchObject({
				setupScript: 'echo from-file\n',
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('create handler fails locally when both setup script options are provided', async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			requestedUrls.push(String(url));
			throw new Error('unexpected fetch');
		}) as typeof globalThis.fetch;
		const fatal = interceptFatal();

		await expect(
			createWorkspaceSubcommand.handler(
				makeContext({
					opts: {
						setupScript: 'echo inline',
						setupScriptFile: './setup.sh',
					},
				})
			)
		).rejects.toThrow('__EXIT__');

		expect(requestedUrls).toEqual([]);
		expect(fatal.stderr).toContain(
			'Failed to read setup script: Use either --setup-script or --setup-script-file, not both.'
		);
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});

	test('update handler fails locally before fetch when no fields are provided', async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			requestedUrls.push(String(url));
			throw new Error('unexpected fetch');
		}) as typeof globalThis.fetch;
		const fatal = interceptFatal();

		await expect(
			updateWorkspaceSubcommand.handler(makeContext({ args: { workspaceId: 'ws_test' } }))
		).rejects.toThrow('__EXIT__');

		expect(requestedUrls).toEqual([]);
		expect(fatal.stderr).toContain(
			'Failed to update workspace: At least one field must be provided.'
		);
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});

	test('update handler patches dependencies and setup script', async () => {
		let requestBody: unknown;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe('https://coder.example/api/hub/workspaces/ws_test');
			expect(init?.method).toBe('PATCH');
			requestBody = JSON.parse(String(init?.body));
			return jsonResponse({
				workspace: makeWorkspace({
					id: 'ws_test',
					dependencies: ['git'],
					setupScript: 'echo updated',
					snapshot: { status: 'building' },
					selectionCount: 2,
				}),
			});
		}) as typeof globalThis.fetch;

		const result = await updateWorkspaceSubcommand.handler(
			makeContext({
				args: { workspaceId: 'ws_test' },
				opts: { dependency: 'git', setupScript: 'echo updated' },
				json: true,
			})
		);

		expect(requestBody).toEqual({
			dependencies: ['git'],
			setupScript: 'echo updated',
		});
		expect(result).toMatchObject({
			id: 'ws_test',
			dependencies: ['git'],
			setupScript: 'echo updated',
			snapshot: { status: 'building' },
		});
	});

	test('refresh handler posts to workspace snapshot refresh endpoint', async () => {
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe(
				'https://coder.example/api/hub/workspaces/ws_test/snapshot/refresh'
			);
			expect(init?.method).toBe('POST');
			return jsonResponse({
				workspace: makeWorkspace({
					id: 'ws_test',
					snapshot: { status: 'building', buildId: 'wsbuild_test' },
				}),
			});
		}) as typeof globalThis.fetch;

		const result = await refreshWorkspaceSnapshotSubcommand.handler(
			makeContext({ args: { workspaceId: 'ws_test' }, json: true })
		);

		expect(result).toMatchObject({
			id: 'ws_test',
			snapshot: { status: 'building', buildId: 'wsbuild_test' },
		});
	});

	test('validate-dependencies handler parses dependencies and returns validation result', async () => {
		let requestBody: unknown;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe('https://coder.example/api/hub/workspaces/dependencies/validate');
			expect(init?.method).toBe('POST');
			requestBody = JSON.parse(String(init?.body));
			return jsonResponse({
				success: true,
				data: {
					valid: ['git'],
					invalid: [
						{
							package: 'nope',
							error: 'Package "nope" does not exist',
							searchUrl: 'https://packages.debian.org/search?keywords=nope',
						},
					],
				},
			});
		}) as typeof globalThis.fetch;

		const result = await validateWorkspaceDependenciesSubcommand.handler(
			makeContext({
				args: { dependencies: 'git,nope' },
				json: true,
			})
		);

		expect(requestBody).toEqual({ dependencies: ['git', 'nope'] });
		expect(result).toEqual({
			valid: ['git'],
			invalid: [
				{
					package: 'nope',
					error: 'Package "nope" does not exist',
					searchUrl: 'https://packages.debian.org/search?keywords=nope',
				},
			],
		});
	});
});
