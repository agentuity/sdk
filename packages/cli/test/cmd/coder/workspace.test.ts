import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { workspaceCommand } from '../../../src/cmd/coder/workspace';
import { createWorkspaceSubcommand } from '../../../src/cmd/coder/workspace/create';
import { ErrorCode, getExitCode } from '../../../src/errors';

const ORIGINAL_EXIT = process.exit;
const ORIGINAL_STDERR_WRITE = process.stderr.write;
const ORIGINAL_FETCH = globalThis.fetch;

function makeContext(opts: Record<string, unknown> = {}) {
	return {
		args: { name: 'My Workspace' },
		opts: {
			url: 'https://coder.example',
			...opts,
		},
		options: { json: false },
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
			expect(
				example.command.includes('--repo') || example.command.includes('--enabled-agents')
			).toBe(true);
		}
		expect(createExamples.some((example) => example.command.includes('--enabled-agents'))).toBe(
			true
		);
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
			'Failed to create workspace: A workspace needs at least one repo, saved skill, skill bucket, or agent. Use --repo or --enabled-agents.'
		);
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});
});
