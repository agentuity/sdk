import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import type { Logger } from '@agentuity/core';
import { KeyValueClient } from '@agentuity/keyvalue';
import { Hono } from 'hono';
import type { ApiEnv, ApiVariables, StateStore } from '../context';
import { encodeSandboxOutputFrame } from '../../lib/sandbox-output-protocol';

Bun.env.SANDBOX_SNAPSHOT_ID = 'snapshot_test';
Bun.env.AGENTUITY_SDK_KEY = 'sdk_test';

interface SandboxRunParams {
	readonly options: {
		readonly command: {
			readonly exec: readonly string[];
			readonly files?: unknown;
		};
		readonly env?: Record<string, string>;
	};
	readonly stdout?: Writable;
}

interface SandboxCreateParams {
	readonly options: {
		readonly env?: Record<string, string>;
	};
}

interface SandboxExecuteParams {
	readonly sandboxId: string;
	readonly options: {
		readonly command: readonly string[];
		readonly files?: unknown;
	};
}

const sandboxRunCalls: SandboxRunParams[] = [];
const sandboxCreateCalls: SandboxCreateParams[] = [];
const sandboxExecuteCalls: SandboxExecuteParams[] = [];
const createdScriptPaths: string[] = [];
const storageEnvNames = [
	'AWS_BUCKET',
	'AWS_ENDPOINT',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_REGION',
	'S3_BUCKET',
	'S3_ENDPOINT',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY',
	'S3_REGION',
] as const;
const silentLogger: Logger = {
	debug() {},
	error() {},
	fatal(message: unknown): never {
		throw new Error(String(message));
	},
	info() {},
	trace() {},
	warn() {},
	child() {
		return silentLogger;
	},
};

const sandboxRunMock = mock(async (_client: unknown, params: SandboxRunParams) => {
	sandboxRunCalls.push(params);
	params.stdout?.write(encodeSandboxOutputFrame({ type: 'stdout', data: 'hello output' }));
	return { sandboxId: 'sandbox_oneshot', exitCode: 0 };
});

const sandboxCreateMock = mock(async (_client: unknown, params: SandboxCreateParams) => {
	sandboxCreateCalls.push(params);
	return { sandboxId: 'sandbox_interactive' };
});

const sandboxExecuteMock = mock(async (_client: unknown, params: SandboxExecuteParams) => {
	sandboxExecuteCalls.push(params);
	return { executionId: 'execution_1' };
});

const executionGetMock = mock(async () => ({
	status: 'completed',
	exitCode: 0,
}));

class APIClientMock {}
class SandboxNotFoundErrorMock extends Error {}
class SandboxTerminatedErrorMock extends Error {}

mock.module('@agentuity/server', () => ({
	APIClient: APIClientMock,
	SandboxNotFoundError: SandboxNotFoundErrorMock,
	SandboxTerminatedError: SandboxTerminatedErrorMock,
	executionGet: executionGetMock,
	getServiceUrls: () => ({ sandbox: 'https://sandbox.test' }),
	sandboxCreate: sandboxCreateMock,
	sandboxExecute: sandboxExecuteMock,
	sandboxRun: sandboxRunMock,
}));

const { default: sandboxRouter } = await import('../sandbox/route');

async function ensureRunScript(scriptName: string): Promise<void> {
	const scriptPath = `dist/run/${scriptName}.js`;
	if (await Bun.file(scriptPath).exists()) return;

	await mkdir('dist/run', { recursive: true });
	await writeFile(scriptPath, 'console.log("test script");\n');
	createdScriptPaths.push(scriptPath);
}

function storageEnvKeys(env: Record<string, string> | undefined): string[] {
	return Object.keys(env ?? {})
		.filter((key) => key.startsWith('AWS_') || key.startsWith('S3_'))
		.sort();
}

function snapshotStorageEnv(): Record<(typeof storageEnvNames)[number], string | undefined> {
	return Object.fromEntries(storageEnvNames.map((key) => [key, process.env[key]])) as Record<
		(typeof storageEnvNames)[number],
		string | undefined
	>;
}

function setStorageEnv(
	values: Partial<Record<(typeof storageEnvNames)[number], string | undefined>>
): void {
	for (const key of storageEnvNames) {
		const value = values[key];
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

beforeAll(async () => {
	await Promise.all([ensureRunScript('hello'), ensureRunScript('objectstore')]);
});

afterAll(async () => {
	for (const scriptPath of createdScriptPaths) {
		await rm(scriptPath, { force: true });
	}
});

function createLogger(): ApiVariables['logger'] {
	return silentLogger;
}

function createKv(): ApiVariables['kv'] {
	const kv = new KeyValueClient({
		apiKey: 'sdk_test',
		logger: createLogger(),
		url: 'https://keyvalue.test',
	});
	Object.defineProperty(kv, 'get', {
		value: async () => ({ exists: false }),
	});
	Object.defineProperty(kv, 'set', {
		value: async () => {},
	});
	return kv;
}

function createStateStore(): StateStore {
	return {
		async delete() {},
		async entries() {
			return [];
		},
		async get<T>(): Promise<T | undefined> {
			return undefined;
		},
		async has() {
			return false;
		},
		async push() {},
		async set() {},
	};
}

function createThread(): ApiVariables['thread'] {
	return {
		id: 'thread_test',
		state: createStateStore(),
	};
}

function createApp(options: { readonly interactive: boolean }): Hono<ApiEnv> {
	const app = new Hono<ApiEnv>();
	app.use('*', async (c, next) => {
		c.set('logger', createLogger());
		if (options.interactive) {
			c.set('kv', createKv());
			c.set('thread', createThread());
		}
		await next();
	});
	app.route('/api/sandbox', sandboxRouter);
	return app;
}

test('sandbox route completes one-shot execution without storage credentials for non-storage scripts', async () => {
	sandboxRunCalls.length = 0;

	const response = await createApp({ interactive: false }).fetch(
		new Request('http://docs.test/api/sandbox/run?script=hello')
	);
	const body = await response.text();

	expect(response.status).toBe(200);
	expect(body).toContain('event: stdout');
	expect(body).toContain('data: hello output');
	expect(body).toContain('event: done');
	expect(sandboxRunCalls).toHaveLength(1);
	expect(sandboxRunCalls[0]?.options.command.files).toHaveLength(1);
	expect(storageEnvKeys(sandboxRunCalls[0]?.options.env)).toEqual([]);
});

test('sandbox route completes interactive execution without storage credentials for non-storage scripts', async () => {
	sandboxCreateCalls.length = 0;
	sandboxExecuteCalls.length = 0;

	const response = await createApp({ interactive: true }).fetch(
		new Request('http://docs.test/api/sandbox/run?script=hello')
	);
	const body = await response.text();

	expect(response.status).toBe(200);
	expect(body).toContain('event: status');
	expect(body).toContain('event: done');
	expect(sandboxCreateCalls).toHaveLength(1);
	expect(sandboxExecuteCalls).toHaveLength(1);
	expect(storageEnvKeys(sandboxCreateCalls[0]?.options.env)).toEqual([]);
	expect(sandboxExecuteCalls[0]?.options.files).toHaveLength(1);
});

test('sandbox route passes object storage credentials as S3 env only', async () => {
	const previousEnv = snapshotStorageEnv();
	sandboxRunCalls.length = 0;
	setStorageEnv({
		AWS_BUCKET: 'bucket_test',
		AWS_ENDPOINT: 'https://storage.test',
		AWS_ACCESS_KEY_ID: 'access_test',
		AWS_SECRET_ACCESS_KEY: 'secret_test',
		AWS_REGION: 'auto',
	});

	try {
		const response = await createApp({ interactive: false }).fetch(
			new Request('http://docs.test/api/sandbox/run?script=objectstore')
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('event: done');
		expect(sandboxRunCalls).toHaveLength(1);
		expect(sandboxRunCalls[0]?.options.env?.S3_BUCKET).toBe('bucket_test');
		expect(sandboxRunCalls[0]?.options.env?.S3_ENDPOINT).toBe('https://storage.test');
		expect(sandboxRunCalls[0]?.options.env?.S3_ACCESS_KEY_ID).toBe('access_test');
		expect(sandboxRunCalls[0]?.options.env?.S3_SECRET_ACCESS_KEY).toBe('secret_test');
		expect(sandboxRunCalls[0]?.options.env?.S3_REGION).toBe('auto');
		expect(
			storageEnvKeys(sandboxRunCalls[0]?.options.env).filter((key) => key.startsWith('AWS_'))
		).toEqual([]);
	} finally {
		setStorageEnv(previousEnv);
	}
});

test('sandbox route prefers reusable S3 credentials over hashed AWS aliases', async () => {
	const previousEnv = snapshotStorageEnv();
	sandboxRunCalls.length = 0;
	setStorageEnv({
		AWS_BUCKET: 'aws_bucket',
		AWS_ENDPOINT: 'https://aws-storage.test',
		AWS_ACCESS_KEY_ID: 'ags-access-token',
		AWS_SECRET_ACCESS_KEY: 'ags-secret-token',
		AWS_REGION: 'usc',
		S3_BUCKET: 's3_bucket',
		S3_ENDPOINT: 'https://s3-storage.test',
		S3_ACCESS_KEY_ID: 's3_access',
		S3_SECRET_ACCESS_KEY: 's3_secret',
		S3_REGION: 'auto',
	});

	try {
		const response = await createApp({ interactive: false }).fetch(
			new Request('http://docs.test/api/sandbox/run?script=objectstore')
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('event: done');
		expect(sandboxRunCalls).toHaveLength(1);
		expect(sandboxRunCalls[0]?.options.env?.S3_BUCKET).toBe('s3_bucket');
		expect(sandboxRunCalls[0]?.options.env?.S3_ENDPOINT).toBe('https://s3-storage.test');
		expect(sandboxRunCalls[0]?.options.env?.S3_ACCESS_KEY_ID).toBe('s3_access');
		expect(sandboxRunCalls[0]?.options.env?.S3_SECRET_ACCESS_KEY).toBe('s3_secret');
		expect(sandboxRunCalls[0]?.options.env?.S3_REGION).toBe('auto');
		expect(
			storageEnvKeys(sandboxRunCalls[0]?.options.env).filter((key) => key.startsWith('AWS_'))
		).toEqual([]);
	} finally {
		setStorageEnv(previousEnv);
	}
});

test('sandbox route does not forward hashed object storage credentials', async () => {
	const previousEnv = snapshotStorageEnv();
	sandboxRunCalls.length = 0;
	setStorageEnv({
		AWS_BUCKET: 'bucket_test',
		AWS_ENDPOINT: 'https://storage.test',
		AWS_ACCESS_KEY_ID: 'ags-access-token',
		AWS_SECRET_ACCESS_KEY: 'ags-secret-token',
		AWS_REGION: 'auto',
	});

	try {
		const response = await createApp({ interactive: false }).fetch(
			new Request('http://docs.test/api/sandbox/run?script=objectstore')
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain('event: done');
		expect(sandboxRunCalls).toHaveLength(1);
		expect(storageEnvKeys(sandboxRunCalls[0]?.options.env)).toEqual([]);
	} finally {
		setStorageEnv(previousEnv);
	}
});
