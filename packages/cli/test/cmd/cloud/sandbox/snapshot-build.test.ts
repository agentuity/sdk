import { afterEach, describe, expect, test } from 'bun:test';
import { createMinimalLogger } from '@agentuity/core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSubcommand } from '../../../../src/cmd/cloud/sandbox/snapshot/build.ts';
import type { CommandContext } from '../../../../src/types.ts';

interface RecordedRequest {
	readonly method: string;
	readonly pathname: string;
	readonly search: string;
	readonly bodyByteLength: number;
	readonly bodyJson: unknown | undefined;
}

let server: ReturnType<typeof Bun.serve> | undefined;
let buildDir: string | undefined;

afterEach(async () => {
	server?.stop(true);
	server = undefined;

	if (buildDir) {
		await rm(buildDir, { recursive: true, force: true });
		buildDir = undefined;
	}
});

async function createBuildDir(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'snapshot-build-command-test-'));
	await writeFile(
		join(directory, 'agentuity-snapshot.yaml'),
		['version: 1', 'runtime: bun:1', 'env:', '  TEST_VALUE: value', ''].join('\n')
	);
	return directory;
}

function parseJsonBody(bodyText: string | undefined): unknown | undefined {
	if (!bodyText) {
		return undefined;
	}
	const parsed: unknown = JSON.parse(bodyText);
	return parsed;
}

function startCatalystTestServer(requests: RecordedRequest[]): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const body = await request.arrayBuffer();
			const contentType = request.headers.get('content-type') ?? '';
			const bodyText = contentType.includes('application/json')
				? new TextDecoder().decode(body)
				: undefined;

			requests.push({
				method: request.method,
				pathname: url.pathname,
				search: url.search,
				bodyByteLength: body.byteLength,
				bodyJson: parseJsonBody(bodyText),
			});

			if (request.method === 'POST' && url.pathname === '/sandbox/snapshots/build') {
				return Response.json({
					success: true,
					data: {
						snapshotId: 'snp_test',
						uploadUrl: `${url.origin}/upload`,
					},
				});
			}

			if (request.method === 'PUT' && url.pathname === '/upload') {
				return new Response(null, { status: 200 });
			}

			if (request.method === 'POST' && url.pathname === '/sandbox/snapshots/snp_test/finalize') {
				return Response.json({
					success: true,
					data: {
						snapshotId: 'snp_test',
						name: 'empty-env',
						tag: 'latest',
						sizeBytes: 0,
						fileCount: 0,
						public: false,
						createdAt: '2026-06-05T00:00:00.000Z',
					},
				});
			}

			return Response.json({ success: false, message: 'unexpected request' }, { status: 404 });
		},
	});
}

function makeSnapshotBuildContext(directory: string, catalystUrl: string): CommandContext {
	const context = {
		args: { directory },
		opts: {},
		options: { json: true, logLevel: 'error' },
		auth: {
			apiKey: 'ag_test',
			userId: 'usr_test',
			expires: new Date(Date.now() + 60_000),
		},
		orgId: 'org_test',
		region: 'usc',
		config: {
			name: 'test',
			overrides: { catalyst_url: catalystUrl },
			preferences: {},
		},
		logger: createMinimalLogger(),
		getExecutingAgent: () => undefined,
	};

	// createCommand erases schema-specific args/opts at the CommandDefinition boundary.
	return context as unknown as CommandContext;
}

describe('cloud sandbox snapshot build command', () => {
	test('creates the archive temp directory before writing the empty snapshot placeholder', async () => {
		const requests: RecordedRequest[] = [];
		buildDir = await createBuildDir();
		server = startCatalystTestServer(requests);

		const handler = buildSubcommand.handler;
		if (!handler) {
			throw new Error('snapshot build handler is missing');
		}

		const result = await handler(
			makeSnapshotBuildContext(buildDir, `http://127.0.0.1:${server.port}`)
		);

		expect(result).toMatchObject({
			snapshotId: 'snp_test',
			name: 'empty-env',
			tag: 'latest',
			fileCount: 0,
		});
		expect(requests.map((request) => `${request.method} ${request.pathname}`)).toEqual([
			'POST /sandbox/snapshots/build',
			'PUT /upload',
			'POST /sandbox/snapshots/snp_test/finalize',
		]);

		const initRequest = requests.find(
			(request) => request.method === 'POST' && request.pathname === '/sandbox/snapshots/build'
		);
		if (!initRequest) {
			throw new Error('snapshot build init request was not sent');
		}
		expect(initRequest.search).toBe('?orgId=org_test');
		expect(initRequest.bodyJson).toMatchObject({
			runtime: 'bun:1',
			encrypt: true,
			public: false,
		});

		const uploadRequest = requests.find(
			(request) => request.method === 'PUT' && request.pathname === '/upload'
		);
		if (!uploadRequest) {
			throw new Error('snapshot archive upload request was not sent');
		}
		expect(uploadRequest.bodyByteLength).toBeGreaterThan(0);

		const finalizeRequest = requests.find(
			(request) =>
				request.method === 'POST' && request.pathname === '/sandbox/snapshots/snp_test/finalize'
		);
		if (!finalizeRequest) {
			throw new Error('snapshot finalize request was not sent');
		}
		expect(finalizeRequest.search).toBe('?orgId=org_test');
		expect(finalizeRequest.bodyJson).toMatchObject({
			sizeBytes: 0,
			fileCount: 0,
			files: [],
			env: { TEST_VALUE: 'value' },
		});
	});
});
