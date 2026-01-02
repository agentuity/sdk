import { StructuredError } from '../error';

/**
 * Resource limits for a sandbox using Kubernetes-style units
 */
export interface SandboxResources {
	/**
	 * Memory limit (e.g., "500Mi", "1Gi")
	 */
	memory?: string;

	/**
	 * CPU limit in millicores (e.g., "500m", "1000m")
	 */
	cpu?: string;

	/**
	 * Disk limit (e.g., "500Mi", "1Gi")
	 */
	disk?: string;
}

/**
 * Sandbox status
 */
export type SandboxStatus = 'creating' | 'idle' | 'running' | 'terminated' | 'failed';

/**
 * Execution status
 */
export type ExecutionStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'timeout'
	| 'cancelled';

/**
 * Read-only stream interface for consuming streams without write access
 */
export interface StreamReader {
	/**
	 * Unique stream identifier
	 */
	id: string;

	/**
	 * Public URL to access the stream
	 */
	url: string;

	/**
	 * Indicates this is a read-only stream
	 */
	readonly: true;

	/**
	 * Get a ReadableStream that streams from the URL
	 *
	 * @returns a ReadableStream that can be consumed
	 */
	getReader(): ReadableStream<Uint8Array>;
}

/**
 * Stream configuration for sandbox output
 */
export interface SandboxStreamConfig {
	/**
	 * Stream ID for stdout (or "ignore" to discard)
	 */
	stdout?: string;

	/**
	 * Stream ID for stderr (or "ignore" to discard)
	 */
	stderr?: string;

	/**
	 * Stream ID for stdin input
	 */
	stdin?: string;

	/**
	 * Include timestamps in output (default: true)
	 */
	timestamps?: boolean;
}

/**
 * Command to execute in a sandbox
 */
export interface SandboxCommand {
	/**
	 * Command and arguments to execute
	 */
	exec: string[];

	/**
	 * Files to create before execution
	 */
	files?: FileToWrite[];

	/**
	 * Execution mode: "oneshot" auto-destroys sandbox on exit
	 */
	mode?: 'oneshot' | 'interactive';
}

/**
 * Network configuration for sandbox
 */
export interface SandboxNetworkConfig {
	/**
	 * Whether to enable outbound network access (default: false)
	 */
	enabled?: boolean;
}

/**
 * Timeout configuration for sandbox
 */
export interface SandboxTimeoutConfig {
	/**
	 * Idle timeout before sandbox is reaped (e.g., "10m", "1h")
	 */
	idle?: string;

	/**
	 * Maximum execution time per command (e.g., "5m", "1h")
	 */
	execution?: string;
}

/**
 * Options for creating a sandbox
 */
export interface SandboxCreateOptions {
	/**
	 * Resource limits
	 */
	resources?: SandboxResources;

	/**
	 * Environment variables
	 */
	env?: Record<string, string>;

	/**
	 * Network configuration
	 */
	network?: SandboxNetworkConfig;

	/**
	 * Stream configuration for output
	 */
	stream?: SandboxStreamConfig;

	/**
	 * Timeout configuration
	 */
	timeout?: SandboxTimeoutConfig;

	/**
	 * Command to execute (if provided, creates a sandbox with initial execution)
	 */
	command?: SandboxCommand;

	/**
	 * Snapshot ID or tag to restore from when creating the sandbox.
	 * The sandbox will start with the filesystem state from the snapshot.
	 */
	snapshot?: string;

	/**
	 * Apt packages to install when creating the sandbox.
	 * These are installed via `apt install` before executing any commands.
	 */
	dependencies?: string[];

	/**
	 * Optional user-defined metadata to associate with the sandbox.
	 * This can be used to store arbitrary key-value data for tracking or identification.
	 */
	metadata?: Record<string, unknown>;
}

/**
 * A sandbox instance with methods for interaction
 */
export interface Sandbox {
	/**
	 * Unique sandbox identifier
	 */
	id: string;

	/**
	 * Current status
	 */
	status: SandboxStatus;

	/**
	 * Read-only stream for stdout.
	 * When no separate streams are configured, stdout and stderr point to the same
	 * combined stream with interleaved output.
	 */
	stdout: StreamReader;

	/**
	 * Read-only stream for stderr.
	 * When no separate streams are configured, stdout and stderr point to the same
	 * combined stream with interleaved output.
	 */
	stderr: StreamReader;

	/**
	 * True if stdout and stderr are using the same stream (interleaved output).
	 * When true, reading from stdout or stderr will return the same interleaved data.
	 */
	interleaved: boolean;

	/**
	 * Execute a command in the sandbox
	 */
	execute(options: ExecuteOptions): Promise<Execution>;

	/**
	 * Write files to the sandbox workspace.
	 *
	 * @param files - Array of FileToWrite objects with path and Buffer content
	 */
	writeFiles(files: FileToWrite[]): Promise<void>;

	/**
	 * Read a file from the sandbox workspace.
	 * Returns a ReadableStream for efficient streaming of large files.
	 *
	 * @param path - Path to the file relative to the sandbox workspace
	 * @returns ReadableStream of the file contents
	 */
	readFile(path: string): Promise<ReadableStream<Uint8Array>>;

	/**
	 * Destroy the sandbox
	 */
	destroy(): Promise<void>;
}

/**
 * Represents a file to write to the sandbox
 */
export interface FileToWrite {
	/**
	 * Path to the file relative to the sandbox workspace
	 */
	path: string;

	/**
	 * File content as a Buffer
	 */
	content: Buffer;
}

/**
 * Information about a sandbox
 */
export interface SandboxInfo {
	/**
	 * Unique sandbox identifier
	 */
	sandboxId: string;

	/**
	 * Current status
	 */
	status: SandboxStatus;

	/**
	 * Creation timestamp (ISO 8601)
	 */
	createdAt: string;

	/**
	 * Region where the sandbox is running
	 */
	region?: string;

	/**
	 * Snapshot ID this sandbox was created from
	 */
	snapshotId?: string;

	/**
	 * Snapshot tag this sandbox was created from (if the snapshot had a tag)
	 */
	snapshotTag?: string;

	/**
	 * Number of executions run in this sandbox
	 */
	executions: number;

	/**
	 * URL to the stdout output stream
	 */
	stdoutStreamUrl?: string;

	/**
	 * URL to the stderr output stream
	 */
	stderrStreamUrl?: string;

	/**
	 * Apt packages installed in the sandbox
	 */
	dependencies?: string[];

	/**
	 * User-defined metadata associated with the sandbox
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Parameters for listing sandboxes
 */
export interface ListSandboxesParams {
	/**
	 * Filter by project ID
	 */
	projectId?: string;

	/**
	 * Filter by snapshot ID
	 */
	snapshotId?: string;

	/**
	 * Filter by status
	 */
	status?: SandboxStatus;

	/**
	 * Maximum number of results (default: 50, max: 100)
	 */
	limit?: number;

	/**
	 * Pagination offset
	 */
	offset?: number;
}

/**
 * Response from listing sandboxes
 */
export interface ListSandboxesResponse {
	/**
	 * Array of sandbox information
	 */
	sandboxes: SandboxInfo[];

	/**
	 * Total count of sandboxes matching the filter
	 */
	total: number;
}

/**
 * Options for executing a command in a sandbox
 */
export interface ExecuteOptions {
	/**
	 * Command and arguments to execute
	 */
	command: string[];

	/**
	 * Files to create/update before execution
	 */
	files?: FileToWrite[];

	/**
	 * Execution timeout (e.g., "5m")
	 */
	timeout?: string;

	/**
	 * Stream configuration (can override sandbox defaults)
	 */
	stream?: {
		stdout?: string;
		stderr?: string;
		timestamps?: boolean;
	};

	/**
	 * AbortSignal to cancel the operation
	 */
	signal?: AbortSignal;
}

/**
 * An execution instance
 */
export interface Execution {
	/**
	 * Unique execution identifier
	 */
	executionId: string;

	/**
	 * Current status
	 */
	status: ExecutionStatus;

	/**
	 * Exit code (set when completed or failed)
	 */
	exitCode?: number;

	/**
	 * Duration in milliseconds (set when completed)
	 */
	durationMs?: number;

	/**
	 * URL to stream stdout output for this execution
	 */
	stdoutStreamUrl?: string;

	/**
	 * URL to stream stderr output for this execution
	 */
	stderrStreamUrl?: string;
}

/**
 * Options for one-shot sandbox execution
 */
export interface SandboxRunOptions extends Omit<SandboxCreateOptions, 'command'> {
	/**
	 * Command to execute (required for run)
	 */
	command: {
		exec: string[];
		files?: FileToWrite[];
	};
}

/**
 * Result from one-shot sandbox execution
 */
export interface SandboxRunResult {
	/**
	 * Sandbox ID
	 */
	sandboxId: string;

	/**
	 * Exit code from the process
	 */
	exitCode: number;

	/**
	 * Duration in milliseconds
	 */
	durationMs: number;

	/**
	 * Stdout content (if captured)
	 */
	stdout?: string;

	/**
	 * Stderr content (if captured)
	 */
	stderr?: string;
}

/**
 * Sandbox service for creating and managing isolated execution environments
 */
export interface SandboxService {
	/**
	 * Run a one-shot command in a new sandbox (creates, executes, destroys)
	 *
	 * @param options - execution options
	 * @returns result with exit code and optional output
	 *
	 * @example
	 * ```typescript
	 * const result = await ctx.sandbox.run({
	 *   command: {
	 *     exec: ['bun', 'run', 'index.ts'],
	 *     files: [{ path: 'index.ts', content: Buffer.from('console.log("hello")') }]
	 *   }
	 * });
	 * console.log('Exit:', result.exitCode);
	 * ```
	 */
	run(options: SandboxRunOptions): Promise<SandboxRunResult>;

	/**
	 * Create an interactive sandbox for multiple executions
	 *
	 * @param options - sandbox configuration
	 * @returns sandbox instance
	 *
	 * @example
	 * ```typescript
	 * const sandbox = await ctx.sandbox.create({
	 *   resources: { memory: '1Gi', cpu: '1000m' }
	 * });
	 * await sandbox.execute({ command: ['bun', 'init'] });
	 * await sandbox.execute({ command: ['bun', 'add', 'zod'] });
	 * await sandbox.destroy();
	 * ```
	 */
	create(options?: SandboxCreateOptions): Promise<Sandbox>;

	/**
	 * Get sandbox information by ID
	 *
	 * @param sandboxId - sandbox identifier
	 * @returns sandbox information
	 */
	get(sandboxId: string): Promise<SandboxInfo>;

	/**
	 * List sandboxes with optional filtering
	 *
	 * @param params - filter and pagination parameters
	 * @returns list of sandboxes
	 */
	list(params?: ListSandboxesParams): Promise<ListSandboxesResponse>;

	/**
	 * Destroy a sandbox by ID
	 *
	 * @param sandboxId - sandbox identifier
	 */
	destroy(sandboxId: string): Promise<void>;
}

/**
 * Structured error for sandbox operations
 */
export const SandboxError = StructuredError('SandboxError')<{
	sandboxId?: string;
	executionId?: string;
}>();
