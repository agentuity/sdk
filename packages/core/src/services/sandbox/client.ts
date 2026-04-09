import {
	ExecuteOptionsSchema as CoreExecuteOptionsSchema,
	type SandboxCreateOptions,
	type SandboxFileInfo,
	type SandboxInfo,
	type SandboxStatus,
	type Execution,
	type ExecutionStatus,
	type FileToWrite,
	type SandboxRunOptions,
	type SandboxRunResult,
	type ListSandboxesParams,
	type ListSandboxesResponse,
	type ListRuntimesParams,
	type ListRuntimesResponse,
	type Job,
	type CreateJobOptions,
} from './types.ts';
import type { Logger } from '../../logger.ts';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
import { APIClient } from '../api.ts';
import { getEnv } from '../env.ts';
import { sandboxCreate } from './create.ts';
import { sandboxDestroy } from './destroy.ts';
import { sandboxGet } from './get.ts';
import { sandboxExecute } from './execute.ts';
import {
	sandboxWriteFiles,
	sandboxReadFile,
	sandboxListFiles,
	sandboxMkDir,
	sandboxRmFile,
	sandboxRmDir,
	sandboxSetEnv,
} from './files.ts';
import { sandboxPause } from './pause.ts';
import { sandboxResume } from './resume.ts';
import { sandboxRun } from './run.ts';
import {
	executionGet,
	executionList,
	type ExecutionInfo,
	type ExecutionListResponse,
} from './execution.ts';
import { createMinimalLogger } from '../logger.ts';
import { getServiceUrls } from '../config.ts';
import { writeAndDrain } from './util.ts';
import { sandboxList } from './list.ts';
import { runtimeList } from './runtime.ts';
import { jobCreate, jobGet, jobList, jobStop, type JobListResponse } from './job.ts';
import {
	diskCheckpointCreate,
	diskCheckpointList,
	diskCheckpointRestore,
	diskCheckpointDelete,
	type DiskCheckpointInfo,
} from './disk-checkpoint.ts';
import {
	snapshotCreate,
	snapshotGet,
	snapshotList,
	snapshotDelete,
	snapshotTag,
	snapshotLineage,
	type SnapshotInfo,
	type SnapshotListResponse,
	type SnapshotLineageResponse,
	type SnapshotListParams,
	type SnapshotLineageParams,
} from './snapshot.ts';
import { sandboxEventList, type SandboxEventListResponse } from './events.ts';

// Server-side long-poll wait duration per iteration (max 5 minutes supported by server)
const EXECUTION_WAIT_DURATION = '5m';

/** Terminal execution statuses that indicate the command has finished. */
const TERMINAL_STATUSES: Set<ExecutionStatus> = new Set([
	'completed',
	'failed',
	'timeout',
	'cancelled',
]);

/**
 * Wait for execution completion using server-side long-polling with automatic retry.
 *
 * Each iteration asks the server to hold the connection for up to
 * EXECUTION_WAIT_DURATION. If the execution is still running when the
 * server-side wait expires, we loop and issue another long-poll request.
 * This continues until the execution reaches a terminal state or the
 * caller's AbortSignal fires.
 */
async function waitForExecution(
	client: APIClient,
	executionId: string,
	orgId?: string,
	signal?: AbortSignal
): Promise<ExecutionInfo> {
	while (true) {
		if (signal?.aborted) {
			throw new DOMException('The operation was aborted.', 'AbortError');
		}

		// Use server-side long-polling - the server will hold the connection
		// until the execution reaches a terminal state or the wait duration expires.
		// The signal is forwarded so the in-flight fetch is cancelled immediately
		// when the caller aborts, rather than waiting the full poll duration.
		const result = await executionGet(client, {
			executionId,
			orgId,
			wait: EXECUTION_WAIT_DURATION,
			signal,
		});

		// If the execution reached a terminal state, return immediately
		if (TERMINAL_STATUSES.has(result.status as ExecutionStatus)) {
			return result;
		}

		// Non-terminal status (e.g., 'running', 'queued') — the server-side
		// long-poll expired before the command finished. Loop to poll again.
	}
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
export const ExecuteOptionsSchema = CoreExecuteOptionsSchema.extend({
	/** Pipe stdout/stderr to writable streams (e.g., process.stdout) */
	pipe: z
		.object({
			stdout: z.custom<Writable>().optional().describe('stdout writable stream'),
			stderr: z.custom<Writable>().optional().describe('stderr writable stream'),
		})
		.optional()
		.describe('Pipe stdout/stderr to writable streams (e.g., process.stdout)'),
});
export type ExecuteOptions = z.infer<typeof ExecuteOptionsSchema>;

export const SandboxClientOptionsSchema = z.object({
	/** API key for authentication. Defaults to AGENTUITY_SDK_KEY/AGENTUITY_CLI_KEY */
	apiKey: z.string().optional().describe('API key for authentication'),
	/** Base URL for the sandbox API */
	url: z.string().optional().describe('Base URL for the sandbox API'),
	/** Organization ID for multi-tenant operations */
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	/** Custom logger instance */
	logger: z.custom<Logger>().optional().describe('Custom logger instance'),
});
export type SandboxClientOptions = z.infer<typeof SandboxClientOptionsSchema>;

/**
 * I/O options for one-shot sandbox execution via run()
 */
export const SandboxClientRunIOSchema = z.object({
	/** AbortSignal to cancel the execution */
	signal: z.custom<AbortSignal>().optional().describe('AbortSignal to cancel the execution'),
	/** Readable stream for stdin input */
	stdin: z.custom<Readable>().optional().describe('Readable stream for stdin input'),
	/** Writable stream for stdout output */
	stdout: z.custom<Writable>().optional().describe('Writable stream for stdout output'),
	/** Writable stream for stderr output */
	stderr: z.custom<Writable>().optional().describe('Writable stream for stderr output'),
	/** Optional logger override for this run */
	logger: z.custom<Logger>().optional().describe('Optional logger override for this run'),
});
export type SandboxClientRunIO = z.infer<typeof SandboxClientRunIOSchema>;

/**
 * A sandbox instance returned by SandboxClient.create() or SandboxClient.connect()
 */
export interface SandboxInstance {
	/**
	 * Unique sandbox identifier
	 */
	id: string;

	/**
	 * Sandbox status at creation or connection time
	 */
	status: SandboxStatus;

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
	 * List files in the sandbox workspace
	 */
	listFiles(path?: string): Promise<SandboxFileInfo[]>;

	/**
	 * Create a directory in the sandbox workspace
	 */
	mkDir(path: string, recursive?: boolean): Promise<void>;

	/**
	 * Remove a file from the sandbox workspace.
	 * @returns Object with `found` indicating whether the file existed before removal
	 */
	rmFile(path: string): Promise<{ found: boolean }>;

	/**
	 * Remove a directory from the sandbox workspace.
	 * @returns Object with `found` indicating whether the directory existed before removal
	 */
	rmDir(path: string, recursive?: boolean): Promise<{ found: boolean }>;

	/**
	 * Set environment variables on the sandbox. Pass null to delete a variable.
	 */
	setEnv(env: Record<string, string | null>): Promise<Record<string, string>>;

	/**
	 * Get current sandbox information
	 */
	get(): Promise<SandboxInfo>;

	/**
	 * Pause the sandbox, creating a checkpoint of its current state
	 */
	pause(): Promise<void>;

	/**
	 * Resume the sandbox from a paused or evacuated state
	 */
	resume(): Promise<void>;

	/**
	 * Destroy the sandbox and release all resources
	 */
	destroy(): Promise<void>;
}

/**
 * Creates the method implementations shared by both create() and connect().
 * Modelled after the similar helper in packages/runtime/src/services/sandbox/http.ts.
 */
function createSandboxInstanceMethods(
	client: APIClient,
	sandboxId: string,
	orgId?: string
): Omit<
	SandboxInstance,
	'id' | 'status' | 'stdoutStreamUrl' | 'stderrStreamUrl' | 'auditStreamUrl'
> {
	return {
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

		async listFiles(path?: string): Promise<SandboxFileInfo[]> {
			const result = await sandboxListFiles(client, { sandboxId, path, orgId });
			return result.files;
		},

		async mkDir(path: string, recursive?: boolean): Promise<void> {
			await sandboxMkDir(client, { sandboxId, path, recursive, orgId });
		},

		async rmFile(path: string): Promise<{ found: boolean }> {
			return sandboxRmFile(client, { sandboxId, path, orgId });
		},

		async rmDir(path: string, recursive?: boolean): Promise<{ found: boolean }> {
			return sandboxRmDir(client, { sandboxId, path, recursive, orgId });
		},

		async setEnv(env: Record<string, string | null>): Promise<Record<string, string>> {
			const result = await sandboxSetEnv(client, { sandboxId, env, orgId });
			return result.env;
		},

		async get(): Promise<SandboxInfo> {
			return sandboxGet(client, { sandboxId, orgId });
		},

		async pause(): Promise<void> {
			return sandboxPause(client, { sandboxId, orgId });
		},

		async resume(): Promise<void> {
			return sandboxResume(client, { sandboxId, orgId });
		},

		async destroy(): Promise<void> {
			return sandboxDestroy(client, { sandboxId, orgId });
		},
	};
}

/**
 * A job instance returned by SandboxClient.createJob() or SandboxClient.getJob()
 */
export interface JobInstance {
	/**
	 * Unique job identifier
	 */
	readonly id: string;

	/**
	 * ID of the sandbox this job belongs to
	 */
	readonly sandboxId: string;

	/**
	 * Current job status
	 */
	readonly status: string;

	/**
	 * Get the current job status and details
	 */
	get(): Promise<Job>;

	/**
	 * Stop the job
	 * @param force - Force termination with SIGKILL
	 */
	stop(force?: boolean): Promise<Job>;
}

/**
 * Creates the method implementations for JobInstance
 */
function createJobInstanceMethods(
	client: APIClient,
	sandboxId: string,
	jobId: string,
	orgId?: string
): Omit<JobInstance, 'id' | 'sandboxId' | 'status'> {
	return {
		async get(): Promise<Job> {
			return jobGet(client, { sandboxId, jobId, orgId });
		},

		async stop(force?: boolean): Promise<Job> {
			return jobStop(client, { sandboxId, jobId, force, orgId });
		},
	};
}

/**
 * A disk checkpoint instance returned by SandboxClient.createDiskCheckpoint() or SandboxClient.getDiskCheckpoint()
 */
export interface DiskCheckpointInstance {
	/**
	 * Unique checkpoint identifier
	 */
	readonly id: string;

	/**
	 * User-provided checkpoint name
	 */
	readonly name: string;

	/**
	 * ID of the sandbox this checkpoint belongs to
	 */
	readonly sandboxId: string;

	/**
	 * ISO timestamp of creation
	 */
	readonly createdAt: string;

	/**
	 * Parent checkpoint name
	 */
	readonly parent: string;

	/**
	 * Restore the sandbox to this checkpoint
	 */
	restore(): Promise<void>;

	/**
	 * Delete this checkpoint
	 */
	delete(): Promise<void>;
}

/**
 * Creates the method implementations for DiskCheckpointInstance
 */
function createDiskCheckpointInstanceMethods(
	client: APIClient,
	sandboxId: string,
	checkpointId: string,
	orgId?: string
): Omit<DiskCheckpointInstance, 'id' | 'name' | 'sandboxId' | 'createdAt' | 'parent'> {
	return {
		async restore(): Promise<void> {
			return diskCheckpointRestore(client, { sandboxId, checkpointId, orgId });
		},

		async delete(): Promise<void> {
			return diskCheckpointDelete(client, { sandboxId, checkpointId, orgId });
		},
	};
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
		const apiKey = options.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');

		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url =
			options.url ||
			getEnv('AGENTUITY_SANDBOX_URL') ||
			getEnv('AGENTUITY_CATALYST_URL') ||
			getEnv('AGENTUITY_TRANSPORT_URL') ||
			serviceUrls.sandbox;

		const logger = options.logger ?? createMinimalLogger();

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

		return {
			id: response.sandboxId,
			status: response.status,
			stdoutStreamUrl: response.stdoutStreamUrl,
			stderrStreamUrl: response.stderrStreamUrl,
			auditStreamUrl: response.auditStreamUrl,
			...createSandboxInstanceMethods(this.#client, response.sandboxId, this.#orgId),
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

	/**
	 * Get a full sandbox instance for an existing sandbox by ID.
	 *
	 * Unlike `get()` which returns read-only metadata, `connect()` returns
	 * a `SandboxInstance` with `execute()`, `writeFiles()`, and all other
	 * interaction methods — allowing you to resume working with a sandbox
	 * using just its ID.
	 *
	 * @param sandboxId - The sandbox ID to connect to
	 * @returns A sandbox instance with all interaction methods
	 */
	async connect(sandboxId: string): Promise<SandboxInstance> {
		const info = await sandboxGet(this.#client, { sandboxId, orgId: this.#orgId });

		return {
			id: info.sandboxId,
			status: info.status,
			stdoutStreamUrl: info.stdoutStreamUrl,
			stderrStreamUrl: info.stderrStreamUrl,
			auditStreamUrl: info.auditStreamUrl,
			...createSandboxInstanceMethods(this.#client, info.sandboxId, this.#orgId),
		};
	}

	/**
	 * Pause a running sandbox, creating a checkpoint of its current state
	 *
	 * @param sandboxId - The sandbox ID to pause
	 */
	async pause(sandboxId: string): Promise<void> {
		return sandboxPause(this.#client, { sandboxId, orgId: this.#orgId });
	}

	/**
	 * Resume a paused or evacuated sandbox from its checkpoint
	 *
	 * @param sandboxId - The sandbox ID to resume
	 */
	async resume(sandboxId: string): Promise<void> {
		return sandboxResume(this.#client, { sandboxId, orgId: this.#orgId });
	}

	// ===== List Operations =====

	/**
	 * List all sandboxes with optional filtering and pagination
	 *
	 * @param params - Optional parameters for filtering by project, status, and pagination
	 * @returns Paginated list of sandboxes with total count
	 */
	async list(params?: ListSandboxesParams): Promise<ListSandboxesResponse> {
		return sandboxList(this.#client, { ...params, orgId: this.#orgId });
	}

	/**
	 * List available sandbox runtimes
	 *
	 * @param params - Optional parameters for pagination
	 * @returns List of runtimes with total count
	 */
	async listRuntimes(params?: ListRuntimesParams): Promise<ListRuntimesResponse> {
		return runtimeList(this.#client, { ...params, orgId: this.#orgId });
	}

	// ===== Job Operations =====

	/**
	 * Create a new job in a sandbox
	 *
	 * @param sandboxId - The sandbox ID where the job should run
	 * @param options - Job creation options including command
	 * @returns A job instance with get() and stop() methods
	 */
	async createJob(sandboxId: string, options: CreateJobOptions): Promise<JobInstance> {
		const job = await jobCreate(this.#client, { sandboxId, options, orgId: this.#orgId });

		return {
			id: job.jobId,
			sandboxId,
			status: job.status,
			...createJobInstanceMethods(this.#client, sandboxId, job.jobId, this.#orgId),
		};
	}

	/**
	 * Get a job instance by ID
	 *
	 * @param sandboxId - The sandbox ID
	 * @param jobId - The job ID
	 * @returns A job instance with get() and stop() methods
	 */
	async getJob(sandboxId: string, jobId: string): Promise<JobInstance> {
		const job = await jobGet(this.#client, { sandboxId, jobId, orgId: this.#orgId });

		return {
			id: job.jobId,
			sandboxId,
			status: job.status,
			...createJobInstanceMethods(this.#client, sandboxId, job.jobId, this.#orgId),
		};
	}

	/**
	 * List all jobs in a sandbox
	 *
	 * @param sandboxId - The sandbox ID
	 * @param limit - Maximum number of results
	 * @returns List of jobs
	 */
	async listJobs(sandboxId: string, limit?: number): Promise<JobListResponse> {
		return jobList(this.#client, { sandboxId, limit, orgId: this.#orgId });
	}

	// ===== Disk Checkpoint Operations =====

	/**
	 * Create a disk checkpoint of a sandbox
	 *
	 * @param sandboxId - The sandbox ID
	 * @param name - Name for the checkpoint
	 * @returns A checkpoint instance with restore() and delete() methods
	 */
	async createDiskCheckpoint(sandboxId: string, name: string): Promise<DiskCheckpointInstance> {
		const checkpoint = await diskCheckpointCreate(this.#client, {
			sandboxId,
			name,
			orgId: this.#orgId,
		});

		return {
			id: checkpoint.id,
			name: checkpoint.name,
			sandboxId,
			createdAt: checkpoint.createdAt,
			parent: checkpoint.parent,
			...createDiskCheckpointInstanceMethods(
				this.#client,
				sandboxId,
				checkpoint.id,
				this.#orgId
			),
		};
	}

	/**
	 * List all disk checkpoints for a sandbox
	 *
	 * @param sandboxId - The sandbox ID
	 * @returns List of checkpoint info objects
	 */
	async listDiskCheckpoints(sandboxId: string): Promise<DiskCheckpointInfo[]> {
		return diskCheckpointList(this.#client, { sandboxId, orgId: this.#orgId });
	}

	/**
	 * Get a disk checkpoint instance by ID
	 *
	 * @param sandboxId - The sandbox ID
	 * @param checkpointId - The checkpoint ID
	 * @returns A checkpoint instance with restore() and delete() methods
	 */
	async getDiskCheckpoint(
		sandboxId: string,
		checkpointId: string
	): Promise<DiskCheckpointInstance> {
		const checkpoints = await diskCheckpointList(this.#client, {
			sandboxId,
			orgId: this.#orgId,
		});
		const checkpoint = checkpoints.find((c) => c.id === checkpointId);
		if (!checkpoint) {
			throw new Error(`Checkpoint ${checkpointId} not found in sandbox ${sandboxId}`);
		}

		return {
			id: checkpoint.id,
			name: checkpoint.name,
			sandboxId,
			createdAt: checkpoint.createdAt,
			parent: checkpoint.parent,
			...createDiskCheckpointInstanceMethods(
				this.#client,
				sandboxId,
				checkpoint.id,
				this.#orgId
			),
		};
	}

	// ===== Snapshot Operations =====

	/**
	 * Create a snapshot of a sandbox
	 *
	 * @param sandboxId - The sandbox ID to snapshot
	 * @param params - Optional snapshot parameters (name, tag, public, etc.)
	 * @returns The created snapshot information
	 */
	async createSnapshot(
		sandboxId: string,
		params?: {
			name?: string;
			description?: string;
			tag?: string;
			public?: boolean;
		}
	): Promise<SnapshotInfo> {
		return snapshotCreate(this.#client, { sandboxId, ...params, orgId: this.#orgId });
	}

	/**
	 * Get snapshot information by ID
	 *
	 * @param snapshotId - The snapshot ID
	 * @returns Snapshot information
	 */
	async getSnapshot(snapshotId: string): Promise<SnapshotInfo> {
		return snapshotGet(this.#client, { snapshotId, orgId: this.#orgId });
	}

	/**
	 * List snapshots with optional filtering and pagination
	 *
	 * @param params - Optional parameters for filtering and pagination
	 * @returns Paginated list of snapshots
	 */
	async listSnapshots(params?: SnapshotListParams): Promise<SnapshotListResponse> {
		return snapshotList(this.#client, { ...params, orgId: this.#orgId });
	}

	/**
	 * Delete a snapshot
	 *
	 * @param snapshotId - The snapshot ID to delete
	 */
	async deleteSnapshot(snapshotId: string): Promise<void> {
		return snapshotDelete(this.#client, { snapshotId, orgId: this.#orgId });
	}

	/**
	 * Update the tag on a snapshot
	 *
	 * @param snapshotId - The snapshot ID
	 * @param tag - New tag (or null to remove)
	 * @returns Updated snapshot information
	 */
	async tagSnapshot(snapshotId: string, tag: string | null): Promise<SnapshotInfo> {
		return snapshotTag(this.#client, { snapshotId, tag, orgId: this.#orgId });
	}

	/**
	 * Get the lineage (ancestry chain) of a snapshot
	 *
	 * @param params - Parameters specifying which snapshot to get lineage for
	 * @returns Ordered list of snapshots in the lineage
	 */
	async getSnapshotLineage(params?: SnapshotLineageParams): Promise<SnapshotLineageResponse> {
		return snapshotLineage(this.#client, { ...params, orgId: this.#orgId });
	}

	// ===== Execution Operations =====

	/**
	 * Get execution information by ID
	 *
	 * @param executionId - The execution ID
	 * @param wait - Optional wait duration for long-polling (e.g., "5m")
	 * @returns Execution information
	 */
	async getExecution(executionId: string, wait?: string): Promise<ExecutionInfo> {
		return executionGet(this.#client, { executionId, wait, orgId: this.#orgId });
	}

	/**
	 * List executions for a sandbox
	 *
	 * @param sandboxId - The sandbox ID
	 * @param limit - Maximum number of results
	 * @returns List of executions
	 */
	async listExecutions(sandboxId: string, limit?: number): Promise<ExecutionListResponse> {
		return executionList(this.#client, { sandboxId, limit, orgId: this.#orgId });
	}

	// ===== Event Operations =====

	/**
	 * List events for a sandbox
	 *
	 * @param sandboxId - The sandbox ID
	 * @param params - Optional parameters for limit and sort direction
	 * @returns List of sandbox events
	 */
	async listEvents(
		sandboxId: string,
		params?: { limit?: number; direction?: 'asc' | 'desc' }
	): Promise<SandboxEventListResponse> {
		return sandboxEventList(this.#client, { sandboxId, ...params, orgId: this.#orgId });
	}
}
