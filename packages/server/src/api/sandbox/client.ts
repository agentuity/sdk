import type {
	Logger,
	SandboxCreateOptions,
	SandboxInfo,
	ExecuteOptions as CoreExecuteOptions,
	Execution,
} from '@agentuity/core';
import type { Writable } from 'node:stream';
import { APIClient } from '../api';
import { sandboxCreate, type SandboxCreateResponse } from './create';
import { sandboxDestroy } from './destroy';
import { sandboxGet } from './get';
import { sandboxExecute } from './execute';
import { executionGet, type ExecutionInfo } from './execution';
import { ConsoleLogger } from '../../logger';
import { getServiceUrls } from '../../config';

const POLL_INTERVAL_MS = 100;
const MAX_POLL_TIME_MS = 300000; // 5 minutes

/**
 * Poll for execution completion
 */
async function waitForExecution(
	client: APIClient,
	executionId: string,
	orgId?: string
): Promise<ExecutionInfo> {
	const startTime = Date.now();

	while (Date.now() - startTime < MAX_POLL_TIME_MS) {
		const info = await executionGet(client, { executionId, orgId });

		if (info.status === 'completed' || info.status === 'failed' || info.status === 'timeout' || info.status === 'cancelled') {
			return info;
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	throw new Error(`Execution ${executionId} timed out waiting for completion`);
}

/**
 * Pipes a remote stream URL to a local writable stream
 */
async function pipeStreamToWritable(streamUrl: string, writable: Writable): Promise<void> {
	const response = await fetch(streamUrl);
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
				writable.write(value);
			}
		}
	} finally {
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
	 * Execute a command in the sandbox
	 */
	execute(options: ExecuteOptions): Promise<Execution>;

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
 * const client = new SandboxClient();
 * const sandbox = await client.create();
 * const result = await sandbox.execute({ command: ['echo', 'hello'] });
 * await sandbox.destroy();
 * ```
 */
export class SandboxClient {
	readonly #client: APIClient;
	readonly #orgId?: string;

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

		this.#client = new APIClient(url, logger, apiKey ?? '', {});
		this.#orgId = options.orgId;
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

			async execute(executeOptions: ExecuteOptions): Promise<Execution> {
				const { pipe, ...coreOptions } = executeOptions;

				const initialResult = await sandboxExecute(client, {
					sandboxId,
					options: coreOptions,
					orgId,
				});

				// If pipe options provided, stream the output to the writable streams
				if (pipe) {
					const streamPromises: Promise<void>[] = [];

					if (pipe.stdout && initialResult.stdoutStreamUrl) {
						streamPromises.push(pipeStreamToWritable(initialResult.stdoutStreamUrl, pipe.stdout));
					}
					if (pipe.stderr && initialResult.stderrStreamUrl) {
						streamPromises.push(pipeStreamToWritable(initialResult.stderrStreamUrl, pipe.stderr));
					}

					// Wait for all streams to complete
					if (streamPromises.length > 0) {
						await Promise.all(streamPromises);
					}
				}

				// Wait for execution to complete and get final result with exit code
				const finalResult = await waitForExecution(client, initialResult.executionId, orgId);

				return {
					executionId: finalResult.executionId,
					status: finalResult.status,
					exitCode: finalResult.exitCode,
					durationMs: finalResult.durationMs,
					stdoutStreamUrl: initialResult.stdoutStreamUrl,
					stderrStreamUrl: initialResult.stderrStreamUrl,
				};
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
}
