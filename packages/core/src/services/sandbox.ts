import { StructuredError } from '../error.ts';
import type { SortDirection } from './pagination.ts';

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
export type SandboxStatus =
	| 'creating'
	| 'idle'
	| 'running'
	| 'paused'
	| 'stopping'
	| 'suspended'
	| 'terminated'
	| 'failed'
	| 'deleted';

export type SandboxSortField =
	| 'name'
	| 'created'
	| 'updated'
	| 'status'
	| 'mode'
	| 'execution_count';
export type SnapshotSortField = 'name' | 'created' | 'size' | 'files';
export type RuntimeSortField = 'name' | 'created';

/**
 * Runtime information for a sandbox
 */
export interface SandboxRuntimeRequirements {
	/**
	 * Memory requirement (e.g., "1Gi")
	 */
	memory?: string;

	/**
	 * CPU requirement (e.g., "1")
	 */
	cpu?: string;

	/**
	 * Disk requirement (e.g., "500Mi")
	 */
	disk?: string;

	/**
	 * Whether network access is enabled
	 */
	networkEnabled: boolean;
}

export interface SandboxRuntime {
	/**
	 * Unique runtime identifier
	 */
	id: string;

	/**
	 * Runtime name (e.g., "bun:1", "python:3.14")
	 */
	name: string;

	/**
	 * Optional description
	 */
	description?: string;

	/**
	 * URL for runtime icon
	 */
	iconUrl?: string;

	/**
	 * Brand color for the runtime (hex color code)
	 */
	brandColor?: string;

	/**
	 * URL for runtime documentation or homepage
	 */
	url?: string;

	/**
	 * Optional tags for categorization
	 */
	tags?: string[];

	/**
	 * Runtime requirements (memory, cpu, disk, network)
	 */
	requirements?: SandboxRuntimeRequirements;

	/**
	 * Readme content in markdown format
	 */
	readme?: string;
}

/**
 * Runtime information included in sandbox responses
 */
export interface SandboxRuntimeInfo {
	/**
	 * Unique runtime identifier
	 */
	id: string;

	/**
	 * Runtime name (e.g., "bun:1", "python:3.14")
	 */
	name: string;

	/**
	 * URL for runtime icon
	 */
	iconUrl?: string;

	/**
	 * Brand color for the runtime (hex color code)
	 */
	brandColor?: string;

	/**
	 * Optional tags for categorization
	 */
	tags?: string[];
}

/**
 * Snapshot user information (for private snapshots)
 */
export interface SandboxSnapshotUserInfo {
	/**
	 * User ID
	 */
	id: string;

	/**
	 * User's first name
	 */
	firstName?: string;

	/**
	 * User's last name
	 */
	lastName?: string;
}

/**
 * Snapshot org information (for public snapshots)
 */
export interface SandboxSnapshotOrgInfo {
	/**
	 * Organization ID
	 */
	id: string;

	/**
	 * Organization name
	 */
	name: string;

	/**
	 * Organization slug
	 */
	slug?: string;
}

/**
 * Base snapshot information
 */
interface SandboxSnapshotInfoBase {
	/**
	 * Unique snapshot identifier
	 */
	id: string;

	/**
	 * Snapshot name
	 */
	name?: string;

	/**
	 * Snapshot tag
	 */
	tag?: string;

	/**
	 * Full name with org slug (@slug/name:tag)
	 */
	fullName?: string;
}

/**
 * Public snapshot information - includes org info
 */
export interface SandboxSnapshotInfoPublic extends SandboxSnapshotInfoBase {
	/**
	 * Public snapshot
	 */
	public: true;

	/**
	 * Organization that owns the public snapshot
	 */
	org: SandboxSnapshotOrgInfo;
}

/**
 * Private snapshot information - includes user info
 */
export interface SandboxSnapshotInfoPrivate extends SandboxSnapshotInfoBase {
	/**
	 * Private snapshot
	 */
	public: false;

	/**
	 * User who created the private snapshot
	 */
	user: SandboxSnapshotUserInfo;
}

/**
 * Snapshot information included in sandbox responses (discriminated union)
 */
export type SandboxSnapshotInfo = SandboxSnapshotInfoPublic | SandboxSnapshotInfoPrivate;

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
	 * @deprecated Use top-level `files` option on `SandboxCreateOptions` instead
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

	/**
	 * Port to expose from the sandbox to the outside Internet (1024-65535)
	 */
	port?: number;
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
 * Options for creating a sandbox.
 *
 * **Important:** `snapshot` and `runtime`/`runtimeId` are mutually exclusive.
 * - If you specify `snapshot`, do not specify `runtime` or `runtimeId` (the snapshot's runtime will be used)
 * - If you specify `runtime` or `runtimeId`, do not specify `snapshot`
 *
 * This constraint is enforced at runtime by the API. Specifying both will result in an error:
 * "cannot specify both snapshot and runtime; snapshot includes its own runtime"
 *
 * @example
 * ```typescript
 * // Create from runtime (default)
 * const sandbox1 = await ctx.sandbox.create({
 *   runtime: 'bun:1'
 * });
 *
 * // Create from snapshot (runtime is inherited from snapshot)
 * const sandbox2 = await ctx.sandbox.create({
 *   snapshot: 'my-snapshot:latest'
 * });
 * ```
 */
export interface SandboxCreateOptions {
	/**
	 * Project ID to associate the sandbox with.
	 * If not provided, the sandbox will not be tied to a specific project.
	 */
	projectId?: string;

	/**
	 * Runtime name (e.g., "bun:1", "python:3.14").
	 * If not specified, defaults to "bun:1".
	 *
	 * **Note:** Cannot be specified together with `snapshot`.
	 */
	runtime?: string;

	/**
	 * Runtime ID (e.g., "srt_xxx").
	 * Alternative to specifying runtime by name.
	 *
	 * **Note:** Cannot be specified together with `snapshot`.
	 */
	runtimeId?: string;

	/**
	 * Optional sandbox name.
	 * If not provided, a unique name will be auto-generated.
	 */
	name?: string;

	/**
	 * Optional description for the sandbox.
	 */
	description?: string;

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
	 * Files to write to the sandbox workspace on creation.
	 * These files are written before any command is executed.
	 */
	files?: FileToWrite[];

	/**
	 * Snapshot ID or tag to restore from when creating the sandbox.
	 * The sandbox will start with the filesystem state from the snapshot.
	 *
	 * **Note:** Cannot be specified together with `runtime` or `runtimeId`.
	 * When using a snapshot, the snapshot's runtime will be used automatically.
	 */
	snapshot?: string;

	/**
	 * Apt packages to install when creating the sandbox.
	 * These are installed via `apt install` before executing any commands.
	 */
	dependencies?: string[];

	/**
	 * npm/bun packages to install globally when creating the sandbox.
	 * These are installed via `bun install -g` before executing any commands.
	 */
	packages?: string[];

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
	 * Runtime information for this sandbox
	 */
	runtime?: SandboxRuntime;

	/**
	 * Sandbox name
	 */
	name?: string;

	/**
	 * Sandbox description
	 */
	description?: string;

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
	 * Stream ID for the audit event stream (eBPF/Tetragon security events).
	 * Only present when audit streaming was successfully configured during sandbox creation.
	 */
	auditStreamId?: string;

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
 * Information about a user who created the sandbox
 */
export interface SandboxUserInfo {
	/**
	 * User ID
	 */
	id: string;

	/**
	 * User's first name
	 */
	firstName?: string;

	/**
	 * User's last name
	 */
	lastName?: string;
}

/**
 * Information about an agent associated with the sandbox
 */
export interface SandboxAgentInfo {
	/**
	 * Agent ID
	 */
	id: string;

	/**
	 * Agent name
	 */
	name: string;
}

/**
 * Information about a project associated with the sandbox
 */
export interface SandboxProjectInfo {
	/**
	 * Project ID
	 */
	id: string;

	/**
	 * Project name
	 */
	name: string;
}

/**
 * Information about an organization associated with the sandbox
 */
export interface SandboxOrgInfo {
	/**
	 * Organization ID
	 */
	id: string;

	/**
	 * Organization name
	 */
	name: string;
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
	 * Short identifier used for DNS hostname
	 */
	identifier?: string;

	/**
	 * Sandbox name
	 */
	name?: string;

	/**
	 * Sandbox description
	 */
	description?: string;

	/**
	 * Current status
	 */
	status: SandboxStatus;

	/**
	 * Sandbox mode (interactive or oneshot)
	 */
	mode?: string;

	/**
	 * Creation timestamp (ISO 8601)
	 */
	createdAt: string;

	/**
	 * Region where the sandbox is running
	 */
	region?: string;

	/**
	 * Runtime information
	 */
	runtime?: SandboxRuntimeInfo;

	/**
	 * Snapshot information
	 */
	snapshot?: SandboxSnapshotInfo;

	/**
	 * Number of executions run in this sandbox
	 */
	executions: number;

	/**
	 * Exit code from the last execution (only available for terminated/failed sandboxes)
	 */
	exitCode?: number;

	/**
	 * URL to the stdout output stream
	 */
	stdoutStreamUrl?: string;

	/**
	 * URL to the stderr output stream
	 */
	stderrStreamUrl?: string;

	/**
	 * ID of the audit event stream (eBPF/Tetragon security events)
	 */
	auditStreamId?: string;

	/**
	 * URL to the audit event stream (eBPF/Tetragon security events)
	 */
	auditStreamUrl?: string;

	/**
	 * Apt packages installed in the sandbox
	 */
	dependencies?: string[];

	/**
	 * npm/bun packages installed globally in the sandbox
	 */
	packages?: string[];

	/**
	 * User-defined metadata associated with the sandbox
	 */
	metadata?: Record<string, unknown>;

	/**
	 * Resource limits for this sandbox
	 */
	resources?: SandboxResources;

	/**
	 * Total CPU time consumed in milliseconds (available when terminated)
	 */
	cpuTimeMs?: number;

	/**
	 * Total memory usage in byte-seconds (available when terminated)
	 */
	memoryByteSec?: number;

	/**
	 * Total network egress in bytes (available when terminated)
	 */
	networkEgressBytes?: number;

	/**
	 * Whether network access is enabled for this sandbox
	 */
	networkEnabled?: boolean;

	/**
	 * Network port exposed from the sandbox (1024-65535)
	 */
	networkPort?: number;

	/**
	 * Public URL for the sandbox (only set if networkPort is configured)
	 */
	url?: string;

	/**
	 * User who created the sandbox (if available)
	 */
	user?: SandboxUserInfo;

	/**
	 * Agent associated with the sandbox (if available)
	 */
	agent?: SandboxAgentInfo;

	/**
	 * Project associated with the sandbox (if available)
	 */
	project?: SandboxProjectInfo;

	/**
	 * Organization associated with the sandbox
	 */
	org: SandboxOrgInfo;

	/**
	 * Timeout configuration for this sandbox
	 */
	timeout?: {
		/** Idle timeout duration (e.g., "10m0s") */
		idle?: string;
		/** Execution timeout duration (e.g., "5m0s") */
		execution?: string;
	};

	/**
	 * Startup command configured for this sandbox
	 */
	command?: {
		/** Command and arguments */
		exec: string[];
		/** Execution mode */
		mode?: 'oneshot' | 'interactive';
	};
}

/**
 * Parameters for listing sandboxes
 */
export interface ListSandboxesParams {
	/**
	 * Filter by sandbox name
	 */
	name?: string;

	/**
	 * Filter by sandbox mode
	 */
	mode?: 'oneshot' | 'interactive';

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
	 * Filter by live status.
	 * When true, returns sandboxes with status: creating, running, idle, or failed.
	 * When false or undefined, returns all sandboxes.
	 */
	live?: boolean;

	/**
	 * Maximum number of results (default: 50, max: 100)
	 */
	limit?: number;

	/**
	 * Pagination offset
	 */
	offset?: number;

	/**
	 * Field to sort by
	 */
	sort?: SandboxSortField;

	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: SortDirection;
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
 * Parameters for listing sandbox runtimes
 */
export interface ListRuntimesParams {
	/**
	 * Maximum number of results (default: 50, max: 100)
	 */
	limit?: number;

	/**
	 * Pagination offset
	 */
	offset?: number;

	/**
	 * Field to sort by
	 */
	sort?: RuntimeSortField;

	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: SortDirection;
}

/**
 * Response from listing sandbox runtimes
 */
export interface ListRuntimesResponse {
	/**
	 * Array of runtime information
	 */
	runtimes: SandboxRuntime[];

	/**
	 * Total count of runtimes
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
	 * Files to create/update before execution.
	 * @deprecated Use `sandbox.writeFiles()` before execute, or top-level `files` on `SandboxCreateOptions`
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

// ===== Snapshot Types =====

/**
 * Information about a file in a snapshot
 */
export interface SnapshotFileInfo {
	/**
	 * File path within the snapshot
	 */
	path: string;

	/**
	 * File size in bytes
	 */
	size: number;

	/**
	 * SHA256 hash of the file contents
	 */
	sha256: string;

	/**
	 * MIME type of the file
	 */
	contentType: string;

	/**
	 * Unix file mode/permissions (e.g., 0o644)
	 */
	mode: number;
}

/**
 * Organization information for snapshots
 */
export interface SnapshotOrgInfo {
	/**
	 * Organization ID
	 */
	id: string;

	/**
	 * Organization name
	 */
	name: string;

	/**
	 * Organization slug for building full name
	 */
	slug?: string | null;
}

/**
 * User information for snapshots
 */
export interface SnapshotUserInfo {
	/**
	 * User ID
	 */
	id: string;

	/**
	 * User first name
	 */
	firstName?: string | null;

	/**
	 * User last name
	 */
	lastName?: string | null;
}

/**
 * Detailed information about a snapshot
 */
export interface SnapshotInfo {
	/**
	 * Unique identifier for the snapshot
	 */
	snapshotId: string;

	/**
	 * Runtime ID associated with this snapshot
	 */
	runtimeId?: string | null;

	/**
	 * Display name for the snapshot (URL-safe: letters, numbers, underscores, dashes)
	 */
	name: string;

	/**
	 * Full name with org slug for public snapshots (@slug/name:tag)
	 */
	fullName?: string;

	/**
	 * Description of the snapshot
	 */
	description?: string | null;

	/**
	 * Build message for the snapshot
	 */
	message?: string | null;

	/**
	 * Tag for the snapshot (defaults to "latest")
	 */
	tag?: string | null;

	/**
	 * Total size of the snapshot in bytes
	 */
	sizeBytes: number;

	/**
	 * Number of files in the snapshot
	 */
	fileCount: number;

	/**
	 * ID of the parent snapshot (for incremental snapshots)
	 */
	parentSnapshotId?: string | null;

	/**
	 * Whether the snapshot is publicly accessible
	 */
	public?: boolean;

	/**
	 * Organization name (for public snapshots)
	 */
	orgName?: string;

	/**
	 * Organization slug (for public snapshots)
	 */
	orgSlug?: string;

	/**
	 * Organization details (for public snapshots)
	 */
	org?: SnapshotOrgInfo | null;

	/**
	 * User who pushed the snapshot (for private snapshots)
	 */
	user?: SnapshotUserInfo | null;

	/**
	 * ISO timestamp when the snapshot was created
	 */
	createdAt: string;

	/**
	 * URL to download the snapshot archive
	 */
	downloadUrl?: string;

	/**
	 * List of files in the snapshot
	 */
	files?: SnapshotFileInfo[] | null;

	/**
	 * User-defined metadata key-value pairs
	 */
	userMetadata?: Record<string, string> | null;
}

/**
 * Options for creating a snapshot
 */
export interface SnapshotCreateOptions {
	/**
	 * Display name for the snapshot (letters, numbers, underscores, dashes only)
	 */
	name?: string;

	/**
	 * Description of the snapshot
	 */
	description?: string;

	/**
	 * Tag for the snapshot (defaults to "latest")
	 */
	tag?: string;

	/**
	 * Make the snapshot publicly accessible
	 */
	public?: boolean;
}

/**
 * Parameters for listing snapshots
 */
export interface SnapshotListParams {
	/**
	 * Filter by sandbox ID
	 */
	sandboxId?: string;

	/**
	 * Maximum number of snapshots to return
	 */
	limit?: number;

	/**
	 * Number of snapshots to skip for pagination
	 */
	offset?: number;

	/**
	 * Field to sort by
	 */
	sort?: SnapshotSortField;

	/**
	 * Sort direction (default: 'desc')
	 */
	direction?: SortDirection;
}

/**
 * Response from listing snapshots
 */
export interface SnapshotListResponse {
	/**
	 * List of snapshot entries
	 */
	snapshots: SnapshotInfo[];

	/**
	 * Total number of snapshots matching the query
	 */
	total: number;
}

/**
 * Service for managing sandbox snapshots
 */
export interface SnapshotService {
	/**
	 * Create a snapshot from a sandbox's current state
	 *
	 * @param sandboxId - ID of the sandbox to snapshot
	 * @param options - Optional snapshot configuration
	 * @returns The created snapshot information
	 *
	 * @example
	 * ```typescript
	 * const snapshot = await ctx.sandbox.snapshot.create(sandbox.id, {
	 *   name: 'after-install',
	 *   tag: 'v1.0',
	 *   description: 'State after installing dependencies'
	 * });
	 * ```
	 */
	create(sandboxId: string, options?: SnapshotCreateOptions): Promise<SnapshotInfo>;

	/**
	 * Get detailed information about a snapshot
	 *
	 * @param snapshotId - ID of the snapshot to retrieve
	 * @returns Snapshot information including files and download URL
	 *
	 * @example
	 * ```typescript
	 * const details = await ctx.sandbox.snapshot.get(snapshot.snapshotId);
	 * console.log(`Snapshot has ${details.fileCount} files`);
	 * ```
	 */
	get(snapshotId: string): Promise<SnapshotInfo>;

	/**
	 * List snapshots with optional filtering
	 *
	 * @param params - Optional filter and pagination parameters
	 * @returns Paginated list of snapshots
	 *
	 * @example
	 * ```typescript
	 * const { snapshots, total } = await ctx.sandbox.snapshot.list({ limit: 10 });
	 * ```
	 */
	list(params?: SnapshotListParams): Promise<SnapshotListResponse>;

	/**
	 * Delete a snapshot
	 *
	 * @param snapshotId - ID of the snapshot to delete
	 *
	 * @example
	 * ```typescript
	 * await ctx.sandbox.snapshot.delete(snapshot.snapshotId);
	 * ```
	 */
	delete(snapshotId: string): Promise<void>;

	/**
	 * Add or update a tag on a snapshot
	 *
	 * @param snapshotId - ID of the snapshot to tag
	 * @param tag - New tag name, or null to remove the tag
	 * @returns Updated snapshot information
	 *
	 * @example
	 * ```typescript
	 * // Add a tag
	 * await ctx.sandbox.snapshot.tag(snapshot.snapshotId, 'production');
	 *
	 * // Remove a tag
	 * await ctx.sandbox.snapshot.tag(snapshot.snapshotId, null);
	 * ```
	 */
	tag(snapshotId: string, tag: string | null): Promise<SnapshotInfo>;
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

	/**
	 * Snapshot management operations for creating and managing sandbox snapshots
	 *
	 * @example
	 * ```typescript
	 * // Create a snapshot of a sandbox
	 * const snapshot = await ctx.sandbox.snapshot.create(sandbox.id, {
	 *   name: 'after-install',
	 *   tag: 'v1.0'
	 * });
	 *
	 * // List all snapshots
	 * const { snapshots } = await ctx.sandbox.snapshot.list();
	 *
	 * // Get snapshot details
	 * const details = await ctx.sandbox.snapshot.get(snapshot.snapshotId);
	 *
	 * // Tag a snapshot
	 * await ctx.sandbox.snapshot.tag(snapshot.snapshotId, 'production');
	 *
	 * // Delete a snapshot
	 * await ctx.sandbox.snapshot.delete(snapshot.snapshotId);
	 * ```
	 */
	snapshot: SnapshotService;
}

/**
 * Structured error for sandbox operations
 */
export const SandboxError = StructuredError('SandboxError')<{
	sandboxId?: string;
	executionId?: string;
}>();
