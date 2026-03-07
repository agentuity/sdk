import {
	APIClient,
	executionGet,
	sandboxCreate,
	sandboxDestroy,
	sandboxExecute,
	sandboxGet,
	sandboxList,
	sandboxListFiles,
	sandboxMkDir,
	sandboxPause,
	sandboxReadFile,
	sandboxResume,
	sandboxRmDir,
	sandboxRmFile,
	sandboxRun,
	sandboxSetEnv,
	sandboxWriteFiles,
	snapshotCreate,
	snapshotGet,
	snapshotList,
	snapshotDelete,
	snapshotTag,
} from '@agentuity/server';
import type {
	SandboxService,
	Sandbox,
	SandboxFileInfo,
	SandboxInfo,
	SandboxCreateOptions,
	SandboxRunOptions,
	SandboxRunResult,
	ListSandboxesParams,
	ListSandboxesResponse,
	ExecuteOptions,
	Execution,
	StreamReader,
	SandboxStatus,
	FileToWrite,
	SnapshotService,
	SnapshotCreateOptions,
	SnapshotInfo,
	SnapshotListParams,
	SnapshotListResponse,
} from '@agentuity/core';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER_NAME = 'agentuity.sandbox';

async function withSpan<T>(
	name: string,
	attributes: Record<string, string | number | boolean>,
	fn: () => Promise<T>
): Promise<T> {
	const tracer = trace.getTracer(TRACER_NAME);
	const currentContext = context.active();
	const span = tracer.startSpan(name, { attributes, kind: SpanKind.CLIENT }, currentContext);
	const spanContext = trace.setSpan(currentContext, span);

	try {
		const result = await context.with(spanContext, fn);
		span.setStatus({ code: SpanStatusCode.OK });
		return result;
	} catch (err) {
		const e = err as Error;
		span.recordException(e);
		span.setStatus({ code: SpanStatusCode.ERROR, message: e?.message ?? String(err) });
		throw err;
	} finally {
		span.end();
	}
}

function buildStreamReader(id: string, url: string): StreamReader {
	return {
		id,
		url,
		readonly: true as const,
		getReader(): ReadableStream<Uint8Array> {
			if (!url) {
				return new ReadableStream({
					start(controller) {
						controller.close();
					},
				});
			}
			return new ReadableStream({
				async start(controller) {
					try {
						const response = await fetch(url);
						if (!response.ok || !response.body) {
							controller.close();
							return;
						}
						const reader = response.body.getReader();
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							controller.enqueue(value);
						}
						controller.close();
					} catch {
						controller.close();
					}
				},
			});
		},
	};
}

function createStreamReader(id: string | undefined, baseUrl: string): StreamReader {
	const streamId = id ?? '';
	const url = streamId ? `${baseUrl}/${streamId}` : '';
	return buildStreamReader(streamId, url);
}

function createStreamReaderFromUrl(streamUrl: string | undefined): StreamReader {
	const url = streamUrl ?? '';
	if (!url) return buildStreamReader('', '');
	try {
		const pathname = new URL(url).pathname.replace(/\/+$/, '');
		const id = pathname.split('/').pop() ?? '';
		return buildStreamReader(id, url);
	} catch {
		const id = url.split('/').pop() ?? '';
		return buildStreamReader(id, url);
	}
}

/**
 * Creates the method implementations shared by all Sandbox instances.
 */
function createSandboxMethods(client: APIClient, sandboxId: string) {
	return {
		async execute(options: ExecuteOptions): Promise<Execution> {
			return withSpan(
				'agentuity.sandbox.execute',
				{
					'sandbox.id': sandboxId,
					'sandbox.command': options.command?.join(' ') ?? '',
				},
				async () => {
					const initial = await sandboxExecute(client, {
						sandboxId,
						options,
						signal: options.signal,
					});
					// Wait for execution to reach a terminal state via long-polling
					const final = await executionGet(client, {
						executionId: initial.executionId,
						wait: '60s',
					});
					return {
						executionId: final.executionId,
						status: final.status,
						exitCode: final.exitCode,
						durationMs: final.durationMs,
						stdoutStreamUrl: initial.stdoutStreamUrl,
						stderrStreamUrl: initial.stderrStreamUrl,
					};
				}
			);
		},

		async writeFiles(files: FileToWrite[]): Promise<void> {
			await withSpan(
				'agentuity.sandbox.writeFiles',
				{
					'sandbox.id': sandboxId,
					'sandbox.files.count': files.length,
				},
				() => sandboxWriteFiles(client, { sandboxId, files })
			);
		},

		async readFile(path: string): Promise<ReadableStream<Uint8Array>> {
			return withSpan(
				'agentuity.sandbox.readFile',
				{
					'sandbox.id': sandboxId,
					'sandbox.file.path': path,
				},
				() => sandboxReadFile(client, { sandboxId, path })
			);
		},

		async listFiles(path?: string): Promise<SandboxFileInfo[]> {
			return withSpan(
				'agentuity.sandbox.listFiles',
				{
					'sandbox.id': sandboxId,
					'sandbox.dir.path': path ?? '',
				},
				async () => {
					const result = await sandboxListFiles(client, { sandboxId, path });
					return result.files;
				}
			);
		},

		async mkDir(path: string, recursive?: boolean): Promise<void> {
			await withSpan(
				'agentuity.sandbox.mkDir',
				{
					'sandbox.id': sandboxId,
					'sandbox.dir.path': path,
				},
				() => sandboxMkDir(client, { sandboxId, path, recursive })
			);
		},

		async rmFile(path: string): Promise<void> {
			await withSpan(
				'agentuity.sandbox.rmFile',
				{
					'sandbox.id': sandboxId,
					'sandbox.file.path': path,
				},
				() => sandboxRmFile(client, { sandboxId, path })
			);
		},

		async rmDir(path: string, recursive?: boolean): Promise<void> {
			await withSpan(
				'agentuity.sandbox.rmDir',
				{
					'sandbox.id': sandboxId,
					'sandbox.dir.path': path,
				},
				() => sandboxRmDir(client, { sandboxId, path, recursive })
			);
		},

		async setEnv(env: Record<string, string | null>): Promise<Record<string, string>> {
			return withSpan('agentuity.sandbox.setEnv', { 'sandbox.id': sandboxId }, async () => {
				const result = await sandboxSetEnv(client, { sandboxId, env });
				return result.env;
			});
		},

		async pause(): Promise<void> {
			await withSpan('agentuity.sandbox.pause', { 'sandbox.id': sandboxId }, () =>
				sandboxPause(client, { sandboxId })
			);
		},

		async resume(): Promise<void> {
			await withSpan('agentuity.sandbox.resume', { 'sandbox.id': sandboxId }, () =>
				sandboxResume(client, { sandboxId })
			);
		},

		async destroy(): Promise<void> {
			await withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
				sandboxDestroy(client, { sandboxId })
			);
		},
	};
}

function createSandboxInstance(
	client: APIClient,
	sandboxId: string,
	status: SandboxStatus,
	streamBaseUrl: string,
	stdoutStreamId?: string,
	stderrStreamId?: string,
	auditStreamId?: string
): Sandbox {
	const interleaved = !!(stdoutStreamId && stderrStreamId && stdoutStreamId === stderrStreamId);
	return {
		id: sandboxId,
		status,
		stdout: createStreamReader(stdoutStreamId, streamBaseUrl),
		stderr: createStreamReader(stderrStreamId, streamBaseUrl),
		interleaved,
		auditStreamId,
		...createSandboxMethods(client, sandboxId),
	};
}

function createSandboxInstanceFromInfo(client: APIClient, info: SandboxInfo): Sandbox {
	const stdoutReader = createStreamReaderFromUrl(info.stdoutStreamUrl);
	const stderrReader = createStreamReaderFromUrl(info.stderrStreamUrl);
	const interleaved = !!(stdoutReader.id && stderrReader.id && stdoutReader.id === stderrReader.id);
	return {
		id: info.sandboxId,
		status: info.status,
		name: info.name,
		description: info.description,
		runtime: info.runtime,
		stdout: stdoutReader,
		stderr: stderrReader,
		interleaved,
		auditStreamId: info.auditStreamId,
		...createSandboxMethods(client, info.sandboxId),
	};
}

/**
 * HTTP implementation of the SnapshotService interface
 */
class HTTPSnapshotService implements SnapshotService {
	private client: APIClient;

	constructor(client: APIClient) {
		this.client = client;
	}

	async create(sandboxId: string, options?: SnapshotCreateOptions): Promise<SnapshotInfo> {
		return withSpan(
			'agentuity.sandbox.snapshot.create',
			{
				'sandbox.id': sandboxId,
				'snapshot.name': options?.name ?? '',
				'snapshot.tag': options?.tag ?? '',
			},
			() =>
				snapshotCreate(this.client, {
					sandboxId,
					name: options?.name,
					description: options?.description,
					tag: options?.tag,
					public: options?.public,
				})
		);
	}

	async get(snapshotId: string): Promise<SnapshotInfo> {
		return withSpan('agentuity.sandbox.snapshot.get', { 'snapshot.id': snapshotId }, () =>
			snapshotGet(this.client, { snapshotId })
		);
	}

	async list(params?: SnapshotListParams): Promise<SnapshotListResponse> {
		return withSpan(
			'agentuity.sandbox.snapshot.list',
			{
				'snapshot.sandboxId': params?.sandboxId ?? '',
				'snapshot.limit': params?.limit ?? 50,
			},
			() =>
				snapshotList(this.client, {
					sandboxId: params?.sandboxId,
					limit: params?.limit,
					offset: params?.offset,
				})
		);
	}

	async delete(snapshotId: string): Promise<void> {
		return withSpan('agentuity.sandbox.snapshot.delete', { 'snapshot.id': snapshotId }, () =>
			snapshotDelete(this.client, { snapshotId })
		);
	}

	async tag(snapshotId: string, tag: string | null): Promise<SnapshotInfo> {
		return withSpan(
			'agentuity.sandbox.snapshot.tag',
			{
				'snapshot.id': snapshotId,
				'snapshot.tag': tag ?? '',
			},
			() => snapshotTag(this.client, { snapshotId, tag })
		);
	}
}

/**
 * HTTP implementation of the SandboxService interface
 */
export class HTTPSandboxService implements SandboxService {
	private client: APIClient;
	private streamBaseUrl: string;

	/**
	 * Snapshot management operations
	 */
	public readonly snapshot: SnapshotService;

	constructor(client: APIClient, streamBaseUrl: string) {
		this.client = client;
		this.streamBaseUrl = streamBaseUrl;
		this.snapshot = new HTTPSnapshotService(client);
	}

	async run(options: SandboxRunOptions): Promise<SandboxRunResult> {
		return withSpan(
			'agentuity.sandbox.run',
			{
				'sandbox.command': options.command?.exec?.join(' ') ?? '',
				'sandbox.mode': 'oneshot',
			},
			() => sandboxRun(this.client, { options })
		);
	}

	async create(options?: SandboxCreateOptions): Promise<Sandbox> {
		return withSpan(
			'agentuity.sandbox.create',
			{
				'sandbox.network': options?.network?.enabled ?? false,
				'sandbox.snapshot': options?.snapshot ?? '',
			},
			async () => {
				const response = await sandboxCreate(this.client, { options });
				return createSandboxInstance(
					this.client,
					response.sandboxId,
					response.status,
					this.streamBaseUrl,
					response.stdoutStreamId,
					response.stderrStreamId,
					response.auditStreamId
				);
			}
		);
	}

	async get(sandboxId: string): Promise<SandboxInfo> {
		return withSpan('agentuity.sandbox.get', { 'sandbox.id': sandboxId }, () =>
			sandboxGet(this.client, { sandboxId })
		);
	}

	async list(params?: ListSandboxesParams): Promise<ListSandboxesResponse> {
		return withSpan(
			'agentuity.sandbox.list',
			{
				'sandbox.status': params?.status ?? '',
				'sandbox.limit': params?.limit ?? 50,
			},
			() => sandboxList(this.client, params)
		);
	}

	async connect(sandboxId: string): Promise<Sandbox> {
		return withSpan('agentuity.sandbox.connect', { 'sandbox.id': sandboxId }, async () => {
			const info = await sandboxGet(this.client, { sandboxId });
			return createSandboxInstanceFromInfo(this.client, info);
		});
	}

	async destroy(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
			sandboxDestroy(this.client, { sandboxId })
		);
	}

	async pause(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.pause', { 'sandbox.id': sandboxId }, () =>
			sandboxPause(this.client, { sandboxId })
		);
	}

	async resume(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.resume', { 'sandbox.id': sandboxId }, () =>
			sandboxResume(this.client, { sandboxId })
		);
	}
}
