import {
	APIClient,
	sandboxCreate,
	sandboxDestroy,
	sandboxExecute,
	sandboxGet,
	sandboxList,
	sandboxRun,
	sandboxWriteFiles,
	sandboxReadFile,
} from '@agentuity/server';
import type {
	SandboxService,
	Sandbox,
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

function createStreamReader(id: string | undefined, baseUrl: string): StreamReader {
	const streamId = id ?? '';
	const url = streamId ? `${baseUrl}/${streamId}` : '';

	return {
		id: streamId,
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

function createSandboxInstance(
	client: APIClient,
	sandboxId: string,
	status: SandboxStatus,
	streamBaseUrl: string,
	stdoutStreamId?: string,
	stderrStreamId?: string
): Sandbox {
	const interleaved = !!(stdoutStreamId && stderrStreamId && stdoutStreamId === stderrStreamId);
	return {
		id: sandboxId,
		status,
		stdout: createStreamReader(stdoutStreamId, streamBaseUrl),
		stderr: createStreamReader(stderrStreamId, streamBaseUrl),
		interleaved,

		async execute(options: ExecuteOptions): Promise<Execution> {
			return withSpan(
				'agentuity.sandbox.execute',
				{
					'sandbox.id': sandboxId,
					'sandbox.command': options.command?.join(' ') ?? '',
				},
				() => sandboxExecute(client, { sandboxId, options, signal: options.signal })
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

		async destroy(): Promise<void> {
			await withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
				sandboxDestroy(client, { sandboxId })
			);
		},
	};
}

export class HTTPSandboxService implements SandboxService {
	private client: APIClient;
	private streamBaseUrl: string;

	constructor(client: APIClient, streamBaseUrl: string) {
		this.client = client;
		this.streamBaseUrl = streamBaseUrl;
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
					response.stderrStreamId
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

	async destroy(sandboxId: string): Promise<void> {
		return withSpan('agentuity.sandbox.destroy', { 'sandbox.id': sandboxId }, () =>
			sandboxDestroy(this.client, { sandboxId })
		);
	}
}
