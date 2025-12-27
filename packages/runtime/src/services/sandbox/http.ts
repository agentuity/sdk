import {
	APIClient,
	sandboxCreate,
	sandboxDestroy,
	sandboxExecute,
	sandboxGet,
	sandboxList,
	sandboxRun,
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
} from '@agentuity/core';

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
			return sandboxExecute(client, { sandboxId, options });
		},

		async writeFiles(files: Record<string, string>): Promise<void> {
			await sandboxExecute(client, {
				sandboxId,
				options: {
					command: ['true'],
					files,
				},
			});
		},

		async destroy(): Promise<void> {
			await sandboxDestroy(client, { sandboxId });
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
		return sandboxRun(this.client, { options });
	}

	async create(options?: SandboxCreateOptions): Promise<Sandbox> {
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

	async get(sandboxId: string): Promise<SandboxInfo> {
		return sandboxGet(this.client, { sandboxId });
	}

	async list(params?: ListSandboxesParams): Promise<ListSandboxesResponse> {
		return sandboxList(this.client, params);
	}

	async destroy(sandboxId: string): Promise<void> {
		return sandboxDestroy(this.client, { sandboxId });
	}
}
