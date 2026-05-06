import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCustomSkillSubcommand } from '../../../src/cmd/coder/skill/create';
import { ErrorCode, getExitCode } from '../../../src/errors';

const ORIGINAL_EXIT = process.exit;
const ORIGINAL_STDERR_WRITE = process.stderr.write;
const ORIGINAL_FETCH = globalThis.fetch;

function makeContext(input: { opts?: Record<string, unknown>; json?: boolean } = {}) {
	return {
		args: {},
		opts: {
			url: 'https://coder.example',
			skillId: 'release-checklist',
			name: 'Release checklist',
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

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('coder skill commands', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		process.exit = ORIGINAL_EXIT;
		process.stderr.write = ORIGINAL_STDERR_WRITE;
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('create handler sends inline custom skill content', async () => {
		let requestBody: unknown;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			expect(String(url)).toBe('https://coder.example/api/hub/skills/library');
			expect(init?.method).toBe('POST');
			requestBody = JSON.parse(String(init?.body));
			return jsonResponse({
				skill: {
					id: 'hskill_custom',
					source: 'custom',
					repo: 'custom',
					skillId: 'release-checklist',
					name: 'Release checklist',
					content: '# Release checklist',
					createdAt: '2026-04-08T00:00:00.000Z',
					updatedAt: '2026-04-08T00:00:00.000Z',
				},
			});
		}) as typeof globalThis.fetch;

		const result = await createCustomSkillSubcommand.handler(
			makeContext({ opts: { content: '# Release checklist' }, json: true })
		);

		expect(requestBody).toEqual({
			source: 'custom',
			repo: 'custom',
			skillId: 'release-checklist',
			name: 'Release checklist',
			content: '# Release checklist',
		});
		expect(result).toMatchObject({
			id: 'hskill_custom',
			source: 'custom',
			content: '# Release checklist',
		});
	});

	test('create handler reads custom skill content from file', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agentuity-custom-skill-test-'));
		const contentFile = join(dir, 'SKILL.md');
		writeFileSync(contentFile, '# Release checklist\n');
		let requestBody: unknown;
		try {
			globalThis.fetch = (async (url: string, init?: RequestInit) => {
				expect(String(url)).toBe('https://coder.example/api/hub/skills/library');
				requestBody = JSON.parse(String(init?.body));
				return jsonResponse({
					skill: {
						id: 'hskill_custom',
						source: 'custom',
						repo: 'custom',
						skillId: 'release-checklist',
						name: 'Release checklist',
						content: '# Release checklist\n',
						createdAt: '2026-04-08T00:00:00.000Z',
						updatedAt: '2026-04-08T00:00:00.000Z',
					},
				});
			}) as typeof globalThis.fetch;

			await createCustomSkillSubcommand.handler(
				makeContext({ opts: { contentFile }, json: true })
			);

			expect(requestBody).toMatchObject({
				content: '# Release checklist\n',
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('create handler fails locally when both content options are provided', async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			requestedUrls.push(String(url));
			throw new Error('unexpected fetch');
		}) as typeof globalThis.fetch;
		const fatal = interceptFatal();

		await expect(
			createCustomSkillSubcommand.handler(
				makeContext({
					opts: {
						content: '# Inline',
						contentFile: './SKILL.md',
					},
				})
			)
		).rejects.toThrow('__EXIT__');

		expect(requestedUrls).toEqual([]);
		expect(fatal.stderr).toContain('Use either --content or --content-file, not both.');
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});

	test('create handler fails locally when content is missing', async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (url: string) => {
			requestedUrls.push(String(url));
			throw new Error('unexpected fetch');
		}) as typeof globalThis.fetch;
		const fatal = interceptFatal();

		await expect(createCustomSkillSubcommand.handler(makeContext())).rejects.toThrow('__EXIT__');

		expect(requestedUrls).toEqual([]);
		expect(fatal.stderr).toContain('Provide --content or --content-file.');
		expect(fatal.exitCode).toBe(getExitCode(ErrorCode.VALIDATION_FAILED));
	});
});
