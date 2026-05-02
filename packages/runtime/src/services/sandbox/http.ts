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
	jobCreate,
	jobGet,
	jobList,
	jobStop,
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
	ExecutionStatus,
	StreamReader,
	SandboxStatus,
	FileToWrite,
	SnapshotService,
	SnapshotCreateOptions,
	SnapshotInfo,
	SnapshotListParams,
	SnapshotListResponse,
	CreateJobOptions,
	Job,
	JobListResponse,
	SandboxPauseResult,
} from '@agentuity/core';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER_NAME = 'agentuity.sandbox';

/** Terminal execution statuses that indicate the command has finished. */
const TERMINAL_STATUSES: Set<ExecutionStatus> = new Set([
	'completed',
	'failed',
	'timeout',
	'cancelled',
]);

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
function createSandboxMethods(client: APIClient, sandboxId: string, orgId?: string) {
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
						orgId,
						signal: options.signal,
					});
					// Wait for execution to reach a terminal state via long-polling.
					// The server holds each request for up to 60s; if the execution
					// is still running we loop and issue another long-poll request.
					// The caller's signal is forwarded into every fetch so that
					// cancellation aborts the in-flight request immediately.
					let final: Awaited<ReturnType<typeof executionGet>>;
					do {
						if (options.signal?.aborted) {
							throw new DOMException('The operation was aborted.', 'AbortError');
						}
						final = await executionGet(client, {
							executionId: initial.executionId,
							orgId,
							wait: '60s',
							signal: options.signal,
						});
					} while (!TERMINAL_STATUSES.has(final.status as ExecutionStatus));
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
				() => sandboxWriteFiles(client, { sandboxId, files, orgId })
			);
		},

		async readFile(path: string): Promise<ReadableStream<Uint8Array>> {
			return withSpan(
				'agentuity.sandbox.readFile',
				{
					'sandbox.id': sandboxId,
					'sandbox.file.path': path,
				},
				() => sandboxReadFile(client, { sandboxId, path, orgId })
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
					const result = await sandboxListFiles(client, { sandboxId, path, orgId });
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
				() => sandboxMkDir(client, { sandboxId, path, recursive, orgId })
			);
		},

		async rmFile(path: string): Promise<{ found: boolean }> {
			return withSpan(
				'agentuity.sandbox.rmFile',
				{
					'sandbox.id': sandboxId,
					'sandbox.file.path': path,
				},
				() => sandboxRmFile(client, { sandboxId, path, orgId })
			);
		},

		async rmDir(path: string, recursive?: boolean): Promise<{ found: boolean }> {
			return withSpan(
				'agentuity.sandbox.rmDir',
				{
					'sandbox.id': sandboxId,
					'sandbox.dir.path': path,
				},
				() => sandboxRmDir(client, { sandboxId, path, recursive, orgId })
			);
		},

		async setEnv(env: Record<string, string | null>): Promise<Record<string, string>> {
			return withSpan('agentuity.sandbox.setEnv', { 'sandbox.id': sandboxId }, async () => {
				const result = await sandboxSetEnv(client, { sandboxId, env, orgId });
				return result.env;
			});
		},

		async pause(): Promise<SandboxPauseResult> {
			return withSpan('agentuity.sandbox.pause', { 'sandbox.id': sandboxId }, () =>
				sandboxPause(client, { sandboxId, orgId })
			);
		},

		async resume(): Promise<void> {
			await withSpan('agentuity.sandbox.resume', { 'sandbox.id': sandboxId }, () =>
				sandboxResume(client, { sandboxId, orgId })
			);
		},

		async destroy(): Promise<void> {
			await withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
				sandboxDestroy(client, { sandboxId, orgId })
			);
		},

		async createJob(options: CreateJobOptions): Promise<Job> {
			return withSpan(
				'agentuity.sandbox.createJob',
				{ 'sandbox.id': sandboxId, 'sandbox.command': options.command?.join(' ') ?? '' },
				() => jobCreate(client, { sandboxId, options, orgId })
			);
		},

		async getJob(jobId: string): Promise<Job> {
			return withSpan(
				'agentuity.sandbox.getJob',
				{ 'sandbox.id': sandboxId, 'job.id': jobId },
				() => jobGet(client, { sandboxId, jobId, orgId })
			);
		},

		async listJobs(limit?: number): Promise<JobListResponse> {
			return withSpan('agentuity.sandbox.listJobs', { 'sandbox.id': sandboxId }, () =>
				jobList(client, { sandboxId, limit, orgId })
			);
		},

		async stopJob(jobId: string, force?: boolean): Promise<Job> {
			return withSpan(
				'agentuity.sandbox.stopJob',
				{ 'sandbox.id': sandboxId, 'job.id': jobId },
				() => jobStop(client, { sandboxId, jobId, force, orgId })
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
	auditStreamId?: string,
	orgId?: string
): Sandbox {
	const interleaved = !!(stdoutStreamId && stderrStreamId && stdoutStreamId === stderrStreamId);
	return {
		id: sandboxId,
		status,
		stdout: createStreamReader(stdoutStreamId, streamBaseUrl),
		stderr: createStreamReader(stderrStreamId, streamBaseUrl),
		interleaved,
		auditStreamId,
		...createSandboxMethods(client, sandboxId, orgId),
	};
}

function createSandboxInstanceFromInfo(
	client: APIClient,
	info: SandboxInfo,
	orgId?: string
): Sandbox {
	const stdoutReader = createStreamReaderFromUrl(info.stdoutStreamUrl);
	const stderrReader = createStreamReaderFromUrl(info.stderrStreamUrl);
	const interleaved = !!(
		stdoutReader.id &&
		stderrReader.id &&
		stdoutReader.id === stderrReader.id
	);
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
		...createSandboxMethods(client, info.sandboxId, orgId),
	};
}

/**
 * HTTP implementation of the SnapshotService interface
 */
class HTTPSnapshotService implements SnapshotService {
	private client: APIClient;
	private orgId?: string;

	constructor(client: APIClient, orgId?: string) {
		this.client = client;
		this.orgId = orgId;
	}

	async create(sandboxId: string, options?: SnapshotCreateOptions): Promise<SnapshotInfo> {
		return withSpan(
			'agentuity.sandbox.snapshot.create',
			{
				'sandbox.id': sandboxId,
				'snapshot.name': options?.name ?? '',
				'snapshot.tag': options?.tag ?? '',
				'sandbox.orgId': options?.orgId ?? this.orgId ?? '',
			},
			() =>
				snapshotCreate(this.client, {
					sandboxId,
					name: options?.name,
					description: options?.description,
					tag: options?.tag,
					public: options?.public,
					orgId: options?.orgId ?? this.orgId,
				})
		);
	}

	async get(snapshotId: string): Promise<SnapshotInfo> {
		return withSpan('agentuity.sandbox.snapshot.get', { 'snapshot.id': snapshotId }, () =>
			snapshotGet(this.client, { snapshotId, orgId: this.orgId })
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
					orgId: this.orgId,
				})
		);
	}

	async delete(snapshotId: string): Promise<void> {
		return withSpan('agentuity.sandbox.snapshot.delete', { 'snapshot.id': snapshotId }, () =>
			snapshotDelete(this.client, { snapshotId, orgId: this.orgId })
		);
	}

	async tag(snapshotId: string, tag: string | null): Promise<SnapshotInfo> {
		return withSpan(
			'agentuity.sandbox.snapshot.tag',
			{
				'snapshot.id': snapshotId,
				'snapshot.tag': tag ?? '',
			},
			() => snapshotTag(this.client, { snapshotId, tag, orgId: this.orgId })
		);
	}
}

/**
 * HTTP implementation of the SandboxService interface
 */
export class HTTPSandboxService implements SandboxService {
	private client: APIClient;
	private streamBaseUrl: string;
	private orgId?: string;

	/**
	 * Snapshot management operations
	 */
	public readonly snapshot: SnapshotService;

	constructor(client: APIClient, streamBaseUrl: string, orgId?: string) {
		this.client = client;
		this.streamBaseUrl = streamBaseUrl;
		this.orgId = orgId;
		this.snapshot = new HTTPSnapshotService(client, orgId);
	}

	async run(options: SandboxRunOptions): Promise<SandboxRunResult> {
		return withSpan(
			'agentuity.sandbox.run',
			{
				'sandbox.command': options.command?.exec?.join(' ') ?? '',
				'sandbox.mode': 'oneshot',
				'sandbox.orgId': this.orgId ?? '',
			},
			() => sandboxRun(this.client, { options, orgId: this.orgId })
		);
	}

	async create(options?: SandboxCreateOptions): Promise<Sandbox> {
		return withSpan(
			'agentuity.sandbox.create',
			{
				'sandbox.network': options?.network?.enabled ?? false,
				'sandbox.snapshot': options?.snapshot ?? '',
				'sandbox.orgId': this.orgId ?? '',
			},
			async () => {
				const response = await sandboxCreate(this.client, { options, orgId: this.orgId });
				return createSandboxInstance(
					this.client,
					response.sandboxId,
					response.status,
					this.streamBaseUrl,
					response.stdoutStreamId,
					response.stderrStreamId,
					response.auditStreamId,
					this.orgId
				);
			}
		);
	}

	async get(sandboxId: string): Promise<SandboxInfo> {
		return withSpan('agentuity.sandbox.get', { 'sandbox.id': sandboxId }, () =>
			sandboxGet(this.client, { sandboxId, orgId: this.orgId })
		);
	}

	async list(params?: ListSandboxesParams): Promise<ListSandboxesResponse> {
		return withSpan(
			'agentuity.sandbox.list',
			{
				'sandbox.status': params?.status ?? '',
				'sandbox.limit': params?.limit ?? 50,
				'sandbox.orgId': this.orgId ?? '',
			},
			() => sandboxList(this.client, { ...params, orgId: this.orgId })
		);
	}

	async connect(sandboxId: string): Promise<Sandbox> {
		return withSpan('agentuity.sandbox.connect', { 'sandbox.id': sandboxId }, async () => {
			const info = await sandboxGet(this.client, { sandboxId, orgId: this.orgId });
			return createSandboxInstanceFromInfo(this.client, info, this.orgId);
		});
	}

	async destroy(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
			sandboxDestroy(this.client, { sandboxId, orgId: this.orgId })
		);
	}

	async pause(sandboxId: string): Promise<SandboxPauseResult> {
		return withSpan('agentuity.sandbox.pause', { 'sandbox.id': sandboxId }, () =>
			sandboxPause(this.client, { sandboxId, orgId: this.orgId })
		);
	}

	async resume(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.resume', { 'sandbox.id': sandboxId }, () =>
			sandboxResume(this.client, { sandboxId, orgId: this.orgId })
		);
	}
}
