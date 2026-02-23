import type {
	Logger,
	SandboxCreateOptions,
	SandboxInfo,
	ExecuteOptions as CoreExecuteOptions,
	Execution,
	FileToWrite,
	SandboxRunOptions,
	SandboxRunResult,
} from '@agentuity/core';
import type { Readable, Writable } from 'node:stream';
import { APIClient } from '../api.ts';
import { sandboxCreate, type SandboxCreateResponse } from './create.ts';
import { sandboxDestroy } from './destroy.ts';
import { sandboxGet } from './get.ts';
import { sandboxExecute } from './execute.ts';
import { sandboxWriteFiles, sandboxReadFile } from './files.ts';
import { sandboxRun } from './run.ts';
import { executionGet, type ExecutionInfo } from './execution.ts';
import { ConsoleLogger } from '../../logger.ts';
import { getServiceUrls } from '../../config.ts';
import { writeAndDrain } from './util.ts';

// Server-side long-poll wait duration (max 5 minutes supported by server)
const EXECUTION_WAIT_DURATION = '5m';

/**
 * Wait for execution completion using server-side long-polling.
 * This is more efficient than client-side polling and provides immediate
 * error detection if the sandbox is terminated.
 */
async function waitForExecution(
	client: APIClient,
	executionId: string,
	orgId?: string,
	signal?: AbortSignal
): Promise<ExecutionInfo> {
	if (signal?.aborted) {
		throw new DOMException('The operation was aborted.', 'AbortError');
	}

	// Use server-side long-polling - the server will hold the connection
	// until the execution reaches a terminal state or the wait duration expires
	return executionGet(client, {
		executionId,
		orgId,
		wait: EXECUTION_WAIT_DURATION,
	});
}

/**
 * Pipes a remote stream URL to a local writable stream with proper backpressure handling
 */
async function pipeStreamToWritable(
	streamUrl: string,
	writable: Writable,
	signal?: AbortSignal
): Promise<void> {
	const response = await fetch(streamUrl, { signal });
	if (!response.ok) {
		throw new Error(`Failed to fetch stream: ${response.status} ${response.statusText}`);
	}
	if (!response.body) {
		return;
	}

	const reader = response.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				await writeAndDrain(writable, value);
			}
		}
	} finally {
		try {
			await reader.cancel();
		} catch {
			// Ignore cancel errors - stream may already be closed
		}
		reader.releaseLock();
	}
}

/**
 * Extended execute options that support piping output to writable streams
 */
export interface ExecuteOptions extends CoreExecuteOptions {
	/**
	 * Pipe stdout/stderr to writable streams (e.g., process.stdout)
	 */
	pipe?: {
		stdout?: Writable;
		stderr?: Writable;
	};
}

export interface SandboxClientOptions {
	/**
	 * API key for authentication.
	 * Defaults to process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY
	 */
	apiKey?: string;

	/**
	 * Base URL for the sandbox API.
	 * Defaults to process.env.AGENTUITY_SANDBOX_URL ||
	 *   process.env.AGENTUITY_CATALYST_URL ||
	 *   process.env.AGENTUITY_TRANSPORT_URL ||
	 *   regional catalyst URL
	 */
	url?: string;

	/**
	 * Organization ID for multi-tenant operations
	 */
	orgId?: string;

	/**
	 * Custom logger instance
	 */
	logger?: Logger;
}

/**
 * I/O options for one-shot sandbox execution via run()
 */
export interface SandboxClientRunIO {
	/**
	 * AbortSignal to cancel the execution
	 */
	signal?: AbortSignal;

	/**
	 * Readable stream for stdin input
	 */
	stdin?: Readable;

	/**
	 * Writable stream for stdout output
	 */
	stdout?: Writable;

	/**
	 * Writable stream for stderr output
	 */
	stderr?: Writable;

	/**
	 * Optional logger override for this run
	 */
	logger?: Logger;
}

/**
 * A sandbox instance returned by SandboxClient.create()
 */
export interface SandboxInstance {
	/**
	 * Unique sandbox identifier
	 */
	id: string;

	/**
	 * Sandbox status at creation time
	 */
	status: SandboxCreateResponse['status'];

	/**
	 * URL to stream stdout output
	 */
	stdoutStreamUrl?: string;

	/**
	 * URL to stream stderr output
	 */
	stderrStreamUrl?: string;

	/**
	 * URL to stream audit events (eBPF/Tetragon security events)
	 */
	auditStreamUrl?: string;

	/**
	 * Execute a command in the sandbox
	 */
	execute(options: ExecuteOptions): Promise<Execution>;

	/**
	 * Write files to the sandbox workspace
	 */
	writeFiles(files: FileToWrite[]): Promise<number>;

	/**
	 * Read a file from the sandbox workspace
	 */
	readFile(path: string): Promise<ReadableStream<Uint8Array>>;

	/**
	 * Get current sandbox information
	 */
	get(): Promise<SandboxInfo>;

	/**
	 * Destroy the sandbox and release all resources
	 */
	destroy(): Promise<void>;
}

/**
 * Convenience client for sandbox operations.
 *
 * @example
 * ```typescript
 * // Interactive sandbox usage
 * const client = new SandboxClient();
 * const sandbox = await client.create();
 * const result = await sandbox.execute({ command: ['echo', 'hello'] });
 * await sandbox.destroy();
 *
 * // One-shot execution with streaming
 * const result = await client.run(
 *   { command: { exec: ['bun', 'run', 'script.ts'] } },
 *   { stdout: process.stdout, stderr: process.stderr }
 * );
 * ```
 */
export class SandboxClient {
	readonly #client: APIClient;
	readonly #orgId?: string;
	readonly #apiKey?: string;
	readonly #region: string;
	readonly #logger: Logger;

	constructor(options: SandboxClientOptions = {}) {
		const apiKey =
			options.apiKey || process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY;

		const region = process.env.AGENTUITY_REGION ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url =
			options.url ||
			process.env.AGENTUITY_SANDBOX_URL ||
			process.env.AGENTUITY_CATALYST_URL ||
			process.env.AGENTUITY_TRANSPORT_URL ||
			serviceUrls.sandbox;

		const logger = options.logger ?? new ConsoleLogger('warn');

		// Disable retries for sandbox operations - 409 Conflict means sandbox is busy,
		// not a retryable rate limit. Retrying would waste ~360s (4 attempts × 90s timeout).
		this.#client = new APIClient(url, logger, apiKey ?? '', { maxRetries: 0 });
		this.#orgId = options.orgId;
		this.#apiKey = apiKey;
		this.#region = region;
		this.#logger = logger;
	}

	/**
	 * Run a one-shot command in a new sandbox (creates, executes, destroys)
	 *
	 * This is a high-level convenience method that handles the full lifecycle:
	 * creating a sandbox, streaming I/O, polling for completion, and cleanup.
	 *
	 * @param options - Execution options including command and configuration
	 * @param io - Optional I/O streams and abort signal
	 * @returns The run result including exit code and duration
	 * @throws {Error} If stdin is provided without an API key
	 *
	 * @example
	 * ```typescript
	 * const client = new SandboxClient();
	 * const result = await client.run(
	 *   { command: { exec: ['bun', 'run', 'script.ts'] } },
	 *   { stdout: process.stdout, stderr: process.stderr }
	 * );
	 * console.log('Exit code:', result.exitCode);
	 * ```
	 */
	async run(options: SandboxRunOptions, io: SandboxClientRunIO = {}): Promise<SandboxRunResult> {
		if (io.stdin && !this.#apiKey) {
			throw new Error('SandboxClient.run(): stdin streaming requires an API key');
		}

		return sandboxRun(this.#client, {
			options,
			orgId: this.#orgId,
			region: this.#region,
			apiKey: this.#apiKey,
			signal: io.signal,
			stdin: io.stdin,
			stdout: io.stdout,
			stderr: io.stderr,
			logger: io.logger ?? this.#logger,
		});
	}

	/**
	 * Create a new sandbox instance
	 *
	 * @param options - Optional sandbox configuration
	 * @returns A sandbox instance with execute and destroy methods
	 */
	async create(options?: SandboxCreateOptions): Promise<SandboxInstance> {
		const response = await sandboxCreate(this.#client, {
			options,
			orgId: this.#orgId,
		});

		const sandboxId = response.sandboxId;
		const client = this.#client;
		const orgId = this.#orgId;

		return {
			id: sandboxId,
			status: response.status,
			stdoutStreamUrl: response.stdoutStreamUrl,
			stderrStreamUrl: response.stderrStreamUrl,
			auditStreamUrl: response.auditStreamUrl,

			async execute(executeOptions: ExecuteOptions): Promise<Execution> {
				const { pipe, ...coreOptions } = executeOptions;

				const initialResult = await sandboxExecute(client, {
					sandboxId,
					options: coreOptions,
					orgId,
					signal: coreOptions.signal,
				});

				// If pipe options provided, stream the output to the writable streams
				if (pipe) {
					const streamPromises: Promise<void>[] = [];

					if (pipe.stdout && initialResult.stdoutStreamUrl) {
						streamPromises.push(
							pipeStreamToWritable(
								initialResult.stdoutStreamUrl,
								pipe.stdout,
								coreOptions.signal
							)
						);
					}
					if (pipe.stderr && initialResult.stderrStreamUrl) {
						streamPromises.push(
							pipeStreamToWritable(
								initialResult.stderrStreamUrl,
								pipe.stderr,
								coreOptions.signal
							)
						);
					}

					// Wait for all streams to complete
					if (streamPromises.length > 0) {
						await Promise.all(streamPromises);
					}
				}

				// Wait for execution to complete and get final result with exit code
				const finalResult = await waitForExecution(
					client,
					initialResult.executionId,
					orgId,
					coreOptions.signal
				);

				return {
					executionId: finalResult.executionId,
					status: finalResult.status,
					exitCode: finalResult.exitCode,
					durationMs: finalResult.durationMs,
					stdoutStreamUrl: initialResult.stdoutStreamUrl,
					stderrStreamUrl: initialResult.stderrStreamUrl,
				};
			},

			async writeFiles(files: FileToWrite[]): Promise<number> {
				const result = await sandboxWriteFiles(client, { sandboxId, files, orgId });
				return result.filesWritten;
			},

			async readFile(path: string): Promise<ReadableStream<Uint8Array>> {
				return sandboxReadFile(client, { sandboxId, path, orgId });
			},

			async get(): Promise<SandboxInfo> {
				return sandboxGet(client, { sandboxId, orgId });
			},

			async destroy(): Promise<void> {
				return sandboxDestroy(client, { sandboxId, orgId });
			},
		};
	}

	/**
	 * Get sandbox information by ID
	 *
	 * @param sandboxId - The sandbox ID
	 * @returns Sandbox information
	 */
	async get(sandboxId: string): Promise<SandboxInfo> {
		return sandboxGet(this.#client, { sandboxId, orgId: this.#orgId });
	}

	/**
	 * Destroy a sandbox by ID
	 *
	 * @param sandboxId - The sandbox ID to destroy
	 */
	async destroy(sandboxId: string): Promise<void> {
		return sandboxDestroy(this.#client, { sandboxId, orgId: this.#orgId });
	}

	/**
	 * Write files to a sandbox workspace
	 *
	 * @param sandboxId - The sandbox ID
	 * @param files - Array of files to write with path and content
	 * @param signal - Optional AbortSignal to cancel the operation
	 * @returns The number of files written
	 */
	async writeFiles(
		sandboxId: string,
		files: FileToWrite[],
		signal?: AbortSignal
	): Promise<number> {
		const result = await sandboxWriteFiles(this.#client, {
			sandboxId,
			files,
			orgId: this.#orgId,
			signal,
		});
		return result.filesWritten;
	}

	/**
	 * Read a file from a sandbox workspace
	 *
	 * @param sandboxId - The sandbox ID
	 * @param path - Path to the file relative to the sandbox workspace
	 * @param signal - Optional AbortSignal to cancel the operation
	 * @returns A ReadableStream of the file contents
	 */
	async readFile(
		sandboxId: string,
		path: string,
		signal?: AbortSignal
	): Promise<ReadableStream<Uint8Array>> {
		return sandboxReadFile(this.#client, {
			sandboxId,
			path,
			orgId: this.#orgId,
			signal,
		});
	}
}
