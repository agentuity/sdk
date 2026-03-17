import { z } from 'zod';
import { StructuredError } from '../../error.ts';
import { SortDirectionSchema } from '../pagination.ts';

/**
 * Resource limits for a sandbox using Kubernetes-style units
 */
export const SandboxResourcesSchema = z.object({
	/** Memory limit (e.g., "500Mi", "1Gi") */
	memory: z.string().optional().describe('Memory limit (e.g., "500Mi", "1Gi")'),
	/** CPU limit in millicores (e.g., "500m", "1000m") */
	cpu: z.string().optional().describe('CPU limit in millicores (e.g., "500m", "1000m")'),
	/** Disk limit (e.g., "500Mi", "1Gi") */
	disk: z.string().optional().describe('Disk limit (e.g., "500Mi", "1Gi")'),
});
export type SandboxResources = z.infer<typeof SandboxResourcesSchema>;

/** Sandbox status */
export const SandboxStatusSchema = z.enum([
	'creating',
	'idle',
	'running',
	'paused',
	'stopping',
	'suspended',
	'terminated',
	'failed',
	'deleted',
]);
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;

export const SandboxSortFieldSchema = z.enum([
	'name',
	'created',
	'updated',
	'status',
	'mode',
	'execution_count',
]);
export type SandboxSortField = z.infer<typeof SandboxSortFieldSchema>;

export const SnapshotSortFieldSchema = z.enum(['name', 'created', 'size', 'files']);
export type SnapshotSortField = z.infer<typeof SnapshotSortFieldSchema>;

export const RuntimeSortFieldSchema = z.enum(['name', 'created']);
export type RuntimeSortField = z.infer<typeof RuntimeSortFieldSchema>;

/** Runtime information for a sandbox */
export const SandboxRuntimeRequirementsSchema = z.object({
	/** Memory requirement (e.g., "1Gi") */
	memory: z.string().optional().describe('Memory requirement (e.g., "1Gi")'),
	/** CPU requirement (e.g., "1") */
	cpu: z.string().optional().describe('CPU requirement (e.g., "1")'),
	/** Disk requirement (e.g., "500Mi") */
	disk: z.string().optional().describe('Disk requirement (e.g., "500Mi")'),
	/** Whether network access is enabled */
	networkEnabled: z.boolean().describe('Whether network access is enabled'),
});
export type SandboxRuntimeRequirements = z.infer<typeof SandboxRuntimeRequirementsSchema>;

export const SandboxRuntimeSchema = z.object({
	/** Unique runtime identifier */
	id: z.string().describe('Unique runtime identifier'),
	/** Runtime name (e.g., "bun:1", "python:3.14") */
	name: z.string().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
	/** Optional description */
	description: z.string().optional().describe('Optional description'),
	/** URL for runtime icon */
	iconUrl: z.string().optional().describe('URL for runtime icon'),
	/** Brand color for the runtime (hex color code) */
	brandColor: z.string().optional().describe('Brand color for the runtime (hex color code)'),
	/** URL for runtime documentation or homepage */
	url: z.string().optional().describe('URL for runtime documentation or homepage'),
	/** Optional tags for categorization */
	tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
	/** Runtime requirements (memory, cpu, disk, network) */
	requirements: SandboxRuntimeRequirementsSchema.optional().describe(
		'Runtime requirements (memory, cpu, disk, network)'
	),
	/** Readme content in markdown format */
	readme: z.string().optional().describe('Readme content in markdown format'),
});
export type SandboxRuntime = z.infer<typeof SandboxRuntimeSchema>;

/** Runtime information included in sandbox responses */
export const SandboxRuntimeInfoSchema = z.object({
	/** Unique runtime identifier */
	id: z.string().describe('Unique runtime identifier'),
	/** Runtime name (e.g., "bun:1", "python:3.14") */
	name: z.string().describe('Runtime name (e.g., "bun:1", "python:3.14")'),
	/** URL for runtime icon */
	iconUrl: z.string().optional().describe('URL for runtime icon'),
	/** Brand color for the runtime (hex color code) */
	brandColor: z.string().optional().describe('Brand color for the runtime (hex color code)'),
	/** Optional tags for categorization */
	tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
});
export type SandboxRuntimeInfo = z.infer<typeof SandboxRuntimeInfoSchema>;

/** Snapshot user information (for private snapshots) */
export const SandboxSnapshotUserInfoSchema = z.object({
	/** User ID */
	id: z.string().describe('User ID'),
	/** User's first name */
	firstName: z.string().optional().describe("User's first name"),
	/** User's last name */
	lastName: z.string().optional().describe("User's last name"),
});
export type SandboxSnapshotUserInfo = z.infer<typeof SandboxSnapshotUserInfoSchema>;

/** Snapshot org information (for public snapshots) */
export const SandboxSnapshotOrgInfoSchema = z.object({
	/** Organization ID */
	id: z.string().describe('Organization ID'),
	/** Organization name */
	name: z.string().describe('Organization name'),
	/** Organization slug */
	slug: z.string().optional().describe('Organization slug'),
});
export type SandboxSnapshotOrgInfo = z.infer<typeof SandboxSnapshotOrgInfoSchema>;

/** Base snapshot information */
const SandboxSnapshotInfoBaseSchema = z.object({
	/** Unique snapshot identifier */
	id: z.string().describe('Unique snapshot identifier'),
	/** Snapshot name */
	name: z.string().optional().describe('Snapshot name'),
	/** Snapshot tag */
	tag: z.string().optional().describe('Snapshot tag'),
	/** Full name with org slug (@slug/name:tag) */
	fullName: z.string().optional().describe('Full name with org slug (@slug/name:tag)'),
});

/** Public snapshot information - includes org info */
export const SandboxSnapshotInfoPublicSchema = SandboxSnapshotInfoBaseSchema.extend({
	/** Public snapshot */
	public: z.literal(true).describe('Public snapshot'),
	/** Organization that owns the public snapshot */
	org: SandboxSnapshotOrgInfoSchema.describe('Organization that owns the public snapshot'),
});
export type SandboxSnapshotInfoPublic = z.infer<typeof SandboxSnapshotInfoPublicSchema>;

/** Private snapshot information - includes user info */
export const SandboxSnapshotInfoPrivateSchema = SandboxSnapshotInfoBaseSchema.extend({
	/** Private snapshot */
	public: z.literal(false).describe('Private snapshot'),
	/** User who created the private snapshot */
	user: SandboxSnapshotUserInfoSchema.describe('User who created the private snapshot'),
});
export type SandboxSnapshotInfoPrivate = z.infer<typeof SandboxSnapshotInfoPrivateSchema>;

/** Snapshot information included in sandbox responses (discriminated union) */
export const SandboxSnapshotInfoSchema = z.discriminatedUnion('public', [
	SandboxSnapshotInfoPublicSchema,
	SandboxSnapshotInfoPrivateSchema,
]);
export type SandboxSnapshotInfo = z.infer<typeof SandboxSnapshotInfoSchema>;

/** Execution status */
export const ExecutionStatusSchema = z.enum([
	'queued',
	'running',
	'completed',
	'failed',
	'timeout',
	'cancelled',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

/** Read-only stream interface for consuming streams without write access */
export const StreamReaderSchema = z.object({
	/** Unique stream identifier */
	id: z.string().describe('Unique stream identifier'),
	/** Public URL to access the stream */
	url: z.string().describe('Public URL to access the stream'),
	/** Indicates this is a read-only stream */
	readonly: z.literal(true).describe('Indicates this is a read-only stream'),
	/** Get a ReadableStream that streams from the URL */
	getReader: z
		.custom<() => ReadableStream<Uint8Array>>()
		.describe('Get a ReadableStream that streams from the URL'),
});
export type StreamReader = z.infer<typeof StreamReaderSchema>;

/** Stream configuration for sandbox output */
export const SandboxStreamConfigSchema = z.object({
	/** Stream ID for stdout (or "ignore" to discard) */
	stdout: z.string().optional().describe('Stream ID for stdout (or "ignore" to discard)'),
	/** Stream ID for stderr (or "ignore" to discard) */
	stderr: z.string().optional().describe('Stream ID for stderr (or "ignore" to discard)'),
	/** Stream ID for stdin input */
	stdin: z.string().optional().describe('Stream ID for stdin input'),
	/** Include timestamps in output (default: true) */
	timestamps: z.boolean().optional().describe('Include timestamps in output (default: true)'),
});
export type SandboxStreamConfig = z.infer<typeof SandboxStreamConfigSchema>;

/** Represents a file to write to the sandbox */
export const FileToWriteSchema = z.object({
	/** Path to the file relative to the sandbox workspace */
	path: z.string().describe('Path to the file relative to the sandbox workspace'),
	/** File content as a Buffer */
	content: z.instanceof(Buffer).describe('File content as a Buffer'),
});
export type FileToWrite = z.infer<typeof FileToWriteSchema>;

/** Command to execute in a sandbox */
export const SandboxCommandSchema = z.object({
	/** Command and arguments to execute */
	exec: z.array(z.string()).describe('Command and arguments to execute'),
	/** Files to create before execution */
	files: z.array(FileToWriteSchema).optional().describe('Files to create before execution'),
	/** Execution mode: "oneshot" auto-destroys sandbox on exit */
	mode: z
		.enum(['oneshot', 'interactive'])
		.optional()
		.describe('Execution mode: "oneshot" auto-destroys sandbox on exit'),
});
export type SandboxCommand = z.infer<typeof SandboxCommandSchema>;

/** Network configuration for sandbox */
export const SandboxNetworkConfigSchema = z.object({
	/** Whether to enable outbound network access (default: false) */
	enabled: z
		.boolean()
		.optional()
		.describe('Whether to enable outbound network access (default: false)'),
	/** Port to expose from the sandbox to the outside Internet (1024-65535) */
	port: z
		.number()
		.optional()
		.describe('Port to expose from the sandbox to the outside Internet (1024-65535)'),
});
export type SandboxNetworkConfig = z.infer<typeof SandboxNetworkConfigSchema>;

/** Timeout configuration for sandbox */
export const SandboxTimeoutConfigSchema = z.object({
	/** Idle timeout before sandbox is reaped (e.g., "10m", "1h") */
	idle: z
		.string()
		.optional()
		.describe('Idle timeout before sandbox is reaped (e.g., "10m", "1h")'),
	/** Maximum execution time per command (e.g., "5m", "1h") */
	execution: z
		.string()
		.optional()
		.describe('Maximum execution time per command (e.g., "5m", "1h")'),
});
export type SandboxTimeoutConfig = z.infer<typeof SandboxTimeoutConfigSchema>;

/** Options for creating a sandbox. */
export const SandboxCreateOptionsSchema = z.object({
	/** Project ID to associate the sandbox with. */
	projectId: z.string().optional().describe('Project ID to associate the sandbox with.'),
	/** Runtime name (e.g., "bun:1", "python:3.14"). */
	runtime: z.string().optional().describe('Runtime name (e.g., "bun:1", "python:3.14").'),
	/** Runtime ID (e.g., "srt_xxx"). */
	runtimeId: z.string().optional().describe('Runtime ID (e.g., "srt_xxx").'),
	/** Optional sandbox name. */
	name: z.string().optional().describe('Optional sandbox name.'),
	/** Optional description for the sandbox. */
	description: z.string().optional().describe('Optional description for the sandbox.'),
	/** Resource limits */
	resources: SandboxResourcesSchema.optional().describe('Resource limits'),
	/** Environment variables */
	env: z.record(z.string(), z.string()).optional().describe('Environment variables'),
	/** Network configuration */
	network: SandboxNetworkConfigSchema.optional().describe('Network configuration'),
	/** Stream configuration for output */
	stream: SandboxStreamConfigSchema.optional().describe('Stream configuration for output'),
	/** Timeout configuration */
	timeout: SandboxTimeoutConfigSchema.optional().describe('Timeout configuration'),
	/** Command to execute (if provided, creates a sandbox with initial execution) */
	command: SandboxCommandSchema.optional().describe(
		'Command to execute (if provided, creates a sandbox with initial execution)'
	),
	/** Files to write to the sandbox workspace on creation. */
	files: z
		.array(FileToWriteSchema)
		.optional()
		.describe('Files to write to the sandbox workspace on creation.'),
	/** Snapshot ID or tag to restore from when creating the sandbox. */
	snapshot: z
		.string()
		.optional()
		.describe('Snapshot ID or tag to restore from when creating the sandbox.'),
	/** Apt packages to install when creating the sandbox. */
	dependencies: z
		.array(z.string())
		.optional()
		.describe('Apt packages to install when creating the sandbox.'),
	/** npm/bun packages to install globally when creating the sandbox. */
	packages: z
		.array(z.string())
		.optional()
		.describe('npm/bun packages to install globally when creating the sandbox.'),
	/** Optional user-defined metadata to associate with the sandbox. */
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Optional user-defined metadata to associate with the sandbox.'),
});
export type SandboxCreateOptions = z.infer<typeof SandboxCreateOptionsSchema>;

/** A sandbox instance with methods for interaction */
export const SandboxSchema = z.object({
	/** Unique sandbox identifier */
	id: z.string().describe('Unique sandbox identifier'),
	/** Current status */
	status: SandboxStatusSchema.describe('Current status'),
	/** Runtime information for this sandbox */
	runtime: SandboxRuntimeSchema.optional().describe('Runtime information for this sandbox'),
	/** Sandbox name */
	name: z.string().optional().describe('Sandbox name'),
	/** Sandbox description */
	description: z.string().optional().describe('Sandbox description'),
	/** Read-only stream for stdout. */
	stdout: StreamReaderSchema.describe('Read-only stream for stdout.'),
	/** Read-only stream for stderr. */
	stderr: StreamReaderSchema.describe('Read-only stream for stderr.'),
	/** True if stdout and stderr are using the same stream (interleaved output). */
	interleaved: z
		.boolean()
		.describe('True if stdout and stderr are using the same stream (interleaved output).'),
	/** Stream ID for the audit event stream (eBPF/Tetragon security events). */
	auditStreamId: z
		.string()
		.optional()
		.describe('Stream ID for the audit event stream (eBPF/Tetragon security events).'),
	/** Execute a command in the sandbox */
	execute: z
		.custom<(options: ExecuteOptions) => Promise<Execution>>()
		.describe('Execute a command in the sandbox'),
	/** Write files to the sandbox workspace. */
	writeFiles: z
		.custom<(files: FileToWrite[]) => Promise<void>>()
		.describe('Write files to the sandbox workspace.'),
	/** Read a file from the sandbox workspace. */
	readFile: z
		.custom<(path: string) => Promise<ReadableStream<Uint8Array>>>()
		.describe('Read a file from the sandbox workspace.'),
	/** List files in the sandbox workspace. */
	listFiles: z
		.custom<(path?: string) => Promise<SandboxFileInfo[]>>()
		.describe('List files in the sandbox workspace.'),
	/** Create a directory in the sandbox workspace. */
	mkDir: z
		.custom<(path: string, recursive?: boolean) => Promise<void>>()
		.describe('Create a directory in the sandbox workspace.'),
	/** Remove a file from the sandbox workspace. */
	rmFile: z
		.custom<(path: string) => Promise<void>>()
		.describe('Remove a file from the sandbox workspace.'),
	/** Remove a directory from the sandbox workspace. */
	rmDir: z
		.custom<(path: string, recursive?: boolean) => Promise<void>>()
		.describe('Remove a directory from the sandbox workspace.'),
	/** Set environment variables on the sandbox. Pass null to delete a variable. */
	setEnv: z
		.custom<(env: Record<string, string | null>) => Promise<Record<string, string>>>()
		.describe('Set environment variables on the sandbox. Pass null to delete a variable.'),
	/** Pause the sandbox, creating a checkpoint of its current state. */
	pause: z
		.custom<() => Promise<void>>()
		.describe('Pause the sandbox, creating a checkpoint of its current state.'),
	/** Resume the sandbox from a paused or evacuated state. */
	resume: z
		.custom<() => Promise<void>>()
		.describe('Resume the sandbox from a paused or evacuated state.'),
	/** Destroy the sandbox */
	destroy: z.custom<() => Promise<void>>().describe('Destroy the sandbox'),
});
export type Sandbox = z.infer<typeof SandboxSchema>;

/**
 * File information returned by sandbox file operations.
 * NOTE: This interface is structurally identical to FileInfo in ./files.ts.
 * It is duplicated here to avoid circular type imports. Keep these in sync.
 */
export interface SandboxFileInfo {
	/** File path relative to the listed directory */
	path: string;
	/** File size in bytes */
	size: number;
	/** Whether the entry is a directory */
	isDir: boolean;
	/** Whether the entry is a symbolic link */
	isSymlink?: boolean;
	/** Target path of the symbolic link */
	linkTarget?: string;
	/** Unix permissions as octal string (e.g., "0644") */
	mode: string;
	/** Modification time in RFC3339 format */
	modTime: string;
}

/** Information about a user who created the sandbox */
export const SandboxUserInfoSchema = z.object({
	/** User ID */
	id: z.string().describe('User ID'),
	/** User's first name */
	firstName: z.string().optional().describe("User's first name"),
	/** User's last name */
	lastName: z.string().optional().describe("User's last name"),
});
export type SandboxUserInfo = z.infer<typeof SandboxUserInfoSchema>;

/** Information about an agent associated with the sandbox */
export const SandboxAgentInfoSchema = z.object({
	/** Agent ID */
	id: z.string().describe('Agent ID'),
	/** Agent name */
	name: z.string().describe('Agent name'),
});
export type SandboxAgentInfo = z.infer<typeof SandboxAgentInfoSchema>;

/** Information about a project associated with the sandbox */
export const SandboxProjectInfoSchema = z.object({
	/** Project ID */
	id: z.string().describe('Project ID'),
	/** Project name */
	name: z.string().describe('Project name'),
});
export type SandboxProjectInfo = z.infer<typeof SandboxProjectInfoSchema>;

/** Information about an organization associated with the sandbox */
export const SandboxOrgInfoSchema = z.object({
	/** Organization ID */
	id: z.string().describe('Organization ID'),
	/** Organization name */
	name: z.string().describe('Organization name'),
});
export type SandboxOrgInfo = z.infer<typeof SandboxOrgInfoSchema>;

/** Information about a sandbox */
export const SandboxInfoSchema = z.object({
	/** Unique sandbox identifier */
	sandboxId: z.string().describe('Unique sandbox identifier'),
	/** Short identifier used for DNS hostname */
	identifier: z.string().optional().describe('Short identifier used for DNS hostname'),
	/** Sandbox name */
	name: z.string().optional().describe('Sandbox name'),
	/** Sandbox description */
	description: z.string().optional().describe('Sandbox description'),
	/** Current status */
	status: SandboxStatusSchema.describe('Current status'),
	/** Sandbox mode (interactive or oneshot) */
	mode: z.string().optional().describe('Sandbox mode (interactive or oneshot)'),
	/** Creation timestamp (ISO 8601) */
	createdAt: z.string().describe('Creation timestamp (ISO 8601)'),
	/** Region where the sandbox is running */
	region: z.string().optional().describe('Region where the sandbox is running'),
	/** Runtime information */
	runtime: SandboxRuntimeInfoSchema.optional().describe('Runtime information'),
	/** Snapshot information */
	snapshot: SandboxSnapshotInfoSchema.optional().describe('Snapshot information'),
	/** Number of executions run in this sandbox */
	executions: z.number().describe('Number of executions run in this sandbox'),
	/** Exit code from the last execution (only available for terminated/failed sandboxes) */
	exitCode: z
		.number()
		.optional()
		.describe(
			'Exit code from the last execution (only available for terminated/failed sandboxes)'
		),
	/** URL to the stdout output stream */
	stdoutStreamUrl: z.string().optional().describe('URL to the stdout output stream'),
	/** URL to the stderr output stream */
	stderrStreamUrl: z.string().optional().describe('URL to the stderr output stream'),
	/** ID of the audit event stream (eBPF/Tetragon security events) */
	auditStreamId: z
		.string()
		.optional()
		.describe('ID of the audit event stream (eBPF/Tetragon security events)'),
	/** URL to the audit event stream (eBPF/Tetragon security events) */
	auditStreamUrl: z
		.string()
		.optional()
		.describe('URL to the audit event stream (eBPF/Tetragon security events)'),
	/** Apt packages installed in the sandbox */
	dependencies: z.array(z.string()).optional().describe('Apt packages installed in the sandbox'),
	/** npm/bun packages installed globally in the sandbox */
	packages: z
		.array(z.string())
		.optional()
		.describe('npm/bun packages installed globally in the sandbox'),
	/** User-defined metadata associated with the sandbox */
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('User-defined metadata associated with the sandbox'),
	/** Resource limits for this sandbox */
	resources: SandboxResourcesSchema.optional().describe('Resource limits for this sandbox'),
	/** Total CPU time consumed in milliseconds (available when terminated) */
	cpuTimeMs: z
		.number()
		.optional()
		.describe('Total CPU time consumed in milliseconds (available when terminated)'),
	/** Total memory usage in byte-seconds (available when terminated) */
	memoryByteSec: z
		.number()
		.optional()
		.describe('Total memory usage in byte-seconds (available when terminated)'),
	/** Total network egress in bytes (available when terminated) */
	networkEgressBytes: z
		.number()
		.optional()
		.describe('Total network egress in bytes (available when terminated)'),
	/** Whether network access is enabled for this sandbox */
	networkEnabled: z
		.boolean()
		.optional()
		.describe('Whether network access is enabled for this sandbox'),
	/** Network port exposed from the sandbox (1024-65535) */
	networkPort: z
		.number()
		.optional()
		.describe('Network port exposed from the sandbox (1024-65535)'),
	/** Public URL for the sandbox (only set if networkPort is configured) */
	url: z
		.string()
		.optional()
		.describe('Public URL for the sandbox (only set if networkPort is configured)'),
	/** User who created the sandbox (if available) */
	user: SandboxUserInfoSchema.optional().describe('User who created the sandbox (if available)'),
	/** Agent associated with the sandbox (if available) */
	agent: SandboxAgentInfoSchema.optional().describe(
		'Agent associated with the sandbox (if available)'
	),
	/** Project associated with the sandbox (if available) */
	project: SandboxProjectInfoSchema.optional().describe(
		'Project associated with the sandbox (if available)'
	),
	/** Organization associated with the sandbox */
	org: SandboxOrgInfoSchema.describe('Organization associated with the sandbox'),
	/** Timeout configuration for this sandbox */
	timeout: z
		.object({
			/** Idle timeout duration (e.g., "10m0s") */
			idle: z.string().optional().describe('Idle timeout duration (e.g., "10m0s")'),
			/** Execution timeout duration (e.g., "5m0s") */
			execution: z.string().optional().describe('Execution timeout duration (e.g., "5m0s")'),
		})
		.optional()
		.describe('Timeout configuration for this sandbox'),
	/** Startup command configured for this sandbox */
	command: z
		.object({
			/** Command and arguments */
			exec: z.array(z.string()).describe('Command and arguments'),
			/** Execution mode */
			mode: z.enum(['oneshot', 'interactive']).optional().describe('Execution mode'),
		})
		.optional()
		.describe('Startup command configured for this sandbox'),
});
export type SandboxInfo = z.infer<typeof SandboxInfoSchema>;

/** Parameters for listing sandboxes */
export const ListSandboxesParamsSchema = z.object({
	/** Filter by sandbox name */
	name: z.string().optional().describe('Filter by sandbox name'),
	/** Filter by sandbox mode */
	mode: z.enum(['oneshot', 'interactive']).optional().describe('Filter by sandbox mode'),
	/** Filter by project ID */
	projectId: z.string().optional().describe('Filter by project ID'),
	/** Filter by snapshot ID */
	snapshotId: z.string().optional().describe('Filter by snapshot ID'),
	/** Filter by status */
	status: SandboxStatusSchema.optional().describe('Filter by status'),
	/** Filter by live status. */
	live: z.boolean().optional().describe('Filter by live status.'),
	/** Maximum number of results (default: 50, max: 100) */
	limit: z.number().optional().describe('Maximum number of results (default: 50, max: 100)'),
	/** Pagination offset */
	offset: z.number().optional().describe('Pagination offset'),
	/** Field to sort by */
	sort: SandboxSortFieldSchema.optional().describe('Field to sort by'),
	/** Sort direction (default: desc) */
	direction: SortDirectionSchema.optional().describe('Sort direction (default: desc)'),
});
export type ListSandboxesParams = z.infer<typeof ListSandboxesParamsSchema>;

/** Response from listing sandboxes */
export const ListSandboxesResponseSchema = z.object({
	/** Array of sandbox information */
	sandboxes: z.array(SandboxInfoSchema).describe('Array of sandbox information'),
	/** Total count of sandboxes matching the filter */
	total: z.number().describe('Total count of sandboxes matching the filter'),
});
export type ListSandboxesResponse = z.infer<typeof ListSandboxesResponseSchema>;

/** Parameters for listing sandbox runtimes */
export const ListRuntimesParamsSchema = z.object({
	/** Maximum number of results (default: 50, max: 100) */
	limit: z.number().optional().describe('Maximum number of results (default: 50, max: 100)'),
	/** Pagination offset */
	offset: z.number().optional().describe('Pagination offset'),
	/** Field to sort by */
	sort: RuntimeSortFieldSchema.optional().describe('Field to sort by'),
	/** Sort direction (default: desc) */
	direction: SortDirectionSchema.optional().describe('Sort direction (default: desc)'),
});
export type ListRuntimesParams = z.infer<typeof ListRuntimesParamsSchema>;

/** Response from listing sandbox runtimes */
export const ListRuntimesResponseSchema = z.object({
	/** Array of runtime information */
	runtimes: z.array(SandboxRuntimeSchema).describe('Array of runtime information'),
	/** Total count of runtimes */
	total: z.number().describe('Total count of runtimes'),
});
export type ListRuntimesResponse = z.infer<typeof ListRuntimesResponseSchema>;

/** Options for executing a command in a sandbox */
export const ExecuteOptionsSchema = z.object({
	/** Command and arguments to execute */
	command: z.array(z.string()).describe('Command and arguments to execute'),
	/** Files to create/update before execution. */
	files: z
		.array(FileToWriteSchema)
		.optional()
		.describe('Files to create/update before execution.'),
	/** Execution timeout (e.g., "5m") */
	timeout: z.string().optional().describe('Execution timeout (e.g., "5m")'),
	/** Stream configuration (can override sandbox defaults) */
	stream: z
		.object({
			stdout: z.string().optional().describe('stdout stream id'),
			stderr: z.string().optional().describe('stderr stream id'),
			timestamps: z.boolean().optional().describe('include timestamps'),
		})
		.optional()
		.describe('Stream configuration (can override sandbox defaults)'),
	/** AbortSignal to cancel the operation */
	signal: z.custom<AbortSignal>().optional().describe('AbortSignal to cancel the operation'),
});
export type ExecuteOptions = z.infer<typeof ExecuteOptionsSchema>;

/** An execution instance */
export const ExecutionSchema = z.object({
	/** Unique execution identifier */
	executionId: z.string().describe('Unique execution identifier'),
	/** Current status */
	status: ExecutionStatusSchema.describe('Current status'),
	/** Exit code (set when completed or failed) */
	exitCode: z.number().optional().describe('Exit code (set when completed or failed)'),
	/** Duration in milliseconds (set when completed) */
	durationMs: z.number().optional().describe('Duration in milliseconds (set when completed)'),
	/** URL to stream stdout output for this execution */
	stdoutStreamUrl: z
		.string()
		.optional()
		.describe('URL to stream stdout output for this execution'),
	/** URL to stream stderr output for this execution */
	stderrStreamUrl: z
		.string()
		.optional()
		.describe('URL to stream stderr output for this execution'),
	/** True if the sandbox was automatically resumed from a suspended state to execute this command */
	autoResumed: z
		.boolean()
		.optional()
		.describe(
			'True if the sandbox was automatically resumed from a suspended state to execute this command'
		),
});
export type Execution = z.infer<typeof ExecutionSchema>;

// ===== Snapshot Types =====

/** Information about a file in a snapshot */
export const SnapshotFileInfoSchema = z.object({
	/** File path within the snapshot */
	path: z.string().describe('File path within the snapshot'),
	/** File size in bytes */
	size: z.number().describe('File size in bytes'),
	/** SHA256 hash of the file contents */
	sha256: z.string().describe('SHA256 hash of the file contents'),
	/** MIME type of the file */
	contentType: z.string().describe('MIME type of the file'),
	/** Unix file mode/permissions (e.g., 0o644) */
	mode: z.number().describe('Unix file mode/permissions (e.g., 0o644)'),
});
export type SnapshotFileInfo = z.infer<typeof SnapshotFileInfoSchema>;

/** Organization information for snapshots */
export const SnapshotOrgInfoSchema = z.object({
	/** Organization ID */
	id: z.string().describe('Organization ID'),
	/** Organization name */
	name: z.string().describe('Organization name'),
	/** Organization slug for building full name */
	slug: z.string().nullish().describe('Organization slug for building full name'),
});
export type SnapshotOrgInfo = z.infer<typeof SnapshotOrgInfoSchema>;

/** User information for snapshots */
export const SnapshotUserInfoSchema = z.object({
	/** User ID */
	id: z.string().describe('User ID'),
	/** User first name */
	firstName: z.string().nullish().describe('User first name'),
	/** User last name */
	lastName: z.string().nullish().describe('User last name'),
});
export type SnapshotUserInfo = z.infer<typeof SnapshotUserInfoSchema>;

/** Detailed information about a snapshot */
export const SnapshotInfoSchema = z.object({
	/** Unique identifier for the snapshot */
	snapshotId: z.string().describe('Unique identifier for the snapshot'),
	/** Runtime ID associated with this snapshot */
	runtimeId: z.string().nullish().describe('Runtime ID associated with this snapshot'),
	/** Display name for the snapshot */
	name: z.string().describe('Display name for the snapshot'),
	/** Full name with org slug for public snapshots (@slug/name:tag) */
	fullName: z
		.string()
		.optional()
		.describe('Full name with org slug for public snapshots (@slug/name:tag)'),
	/** Description of the snapshot */
	description: z.string().nullish().describe('Description of the snapshot'),
	/** Build message for the snapshot */
	message: z.string().nullish().describe('Build message for the snapshot'),
	/** Tag for the snapshot (defaults to "latest") */
	tag: z.string().nullish().describe('Tag for the snapshot (defaults to "latest")'),
	/** Total size of the snapshot in bytes */
	sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
	/** Number of files in the snapshot */
	fileCount: z.number().describe('Number of files in the snapshot'),
	/** ID of the parent snapshot (for incremental snapshots) */
	parentSnapshotId: z
		.string()
		.nullish()
		.describe('ID of the parent snapshot (for incremental snapshots)'),
	/** Whether the snapshot is publicly accessible */
	public: z.boolean().optional().describe('Whether the snapshot is publicly accessible'),
	/** Organization name (for public snapshots) */
	orgName: z.string().optional().describe('Organization name (for public snapshots)'),
	/** Organization slug (for public snapshots) */
	orgSlug: z.string().optional().describe('Organization slug (for public snapshots)'),
	/** Organization details (for public snapshots) */
	org: SnapshotOrgInfoSchema.nullish().describe('Organization details (for public snapshots)'),
	/** User who pushed the snapshot (for private snapshots) */
	user: SnapshotUserInfoSchema.nullish().describe(
		'User who pushed the snapshot (for private snapshots)'
	),
	/** ISO timestamp when the snapshot was created */
	createdAt: z.string().describe('ISO timestamp when the snapshot was created'),
	/** URL to download the snapshot archive */
	downloadUrl: z.string().optional().describe('URL to download the snapshot archive'),
	/** List of files in the snapshot */
	files: z.array(SnapshotFileInfoSchema).nullish().describe('List of files in the snapshot'),
	/** User-defined metadata key-value pairs */
	userMetadata: z
		.record(z.string(), z.string())
		.nullish()
		.describe('User-defined metadata key-value pairs'),
});
export type SnapshotInfo = z.infer<typeof SnapshotInfoSchema>;

/** Options for creating a snapshot */
export const SnapshotCreateOptionsSchema = z.object({
	/** Display name for the snapshot (letters, numbers, underscores, dashes only) */
	name: z
		.string()
		.optional()
		.describe('Display name for the snapshot (letters, numbers, underscores, dashes only)'),
	/** Description of the snapshot */
	description: z.string().optional().describe('Description of the snapshot'),
	/** Tag for the snapshot (defaults to "latest") */
	tag: z.string().optional().describe('Tag for the snapshot (defaults to "latest")'),
	/** Make the snapshot publicly accessible */
	public: z.boolean().optional().describe('Make the snapshot publicly accessible'),
});
export type SnapshotCreateOptions = z.infer<typeof SnapshotCreateOptionsSchema>;

/** Parameters for listing snapshots */
export const SnapshotListParamsSchema = z.object({
	/** Filter by sandbox ID */
	sandboxId: z.string().optional().describe('Filter by sandbox ID'),
	/** Maximum number of snapshots to return */
	limit: z.number().optional().describe('Maximum number of snapshots to return'),
	/** Number of snapshots to skip for pagination */
	offset: z.number().optional().describe('Number of snapshots to skip for pagination'),
	/** Field to sort by */
	sort: SnapshotSortFieldSchema.optional().describe('Field to sort by'),
	/** Sort direction (default: desc) */
	direction: SortDirectionSchema.optional().describe('Sort direction (default: desc)'),
});
export type SnapshotListParams = z.infer<typeof SnapshotListParamsSchema>;

/** Response from listing snapshots */
export const SnapshotListResponseSchema = z.object({
	/** List of snapshot entries */
	snapshots: z.array(SnapshotInfoSchema).describe('List of snapshot entries'),
	/** Total number of snapshots matching the query */
	total: z.number().describe('Total number of snapshots matching the query'),
});
export type SnapshotListResponse = z.infer<typeof SnapshotListResponseSchema>;

/**
 * Service for managing sandbox snapshots
 */
export interface SnapshotService {
	create(sandboxId: string, options?: SnapshotCreateOptions): Promise<SnapshotInfo>;
	get(snapshotId: string): Promise<SnapshotInfo>;
	list(params?: SnapshotListParams): Promise<SnapshotListResponse>;
	delete(snapshotId: string): Promise<void>;
	tag(snapshotId: string, tag: string | null): Promise<SnapshotInfo>;
}

/** Options for one-shot sandbox execution */
export const SandboxRunOptionsSchema = SandboxCreateOptionsSchema.omit({ command: true }).extend({
	/** Command to execute (required for run) */
	command: z.object({
		exec: z.array(z.string()).describe('Command arguments to execute'),
		files: z.array(FileToWriteSchema).optional().describe('Files to create before execution'),
	}),
});
export type SandboxRunOptions = z.infer<typeof SandboxRunOptionsSchema>;

/** Result from one-shot sandbox execution */
export const SandboxRunResultSchema = z.object({
	/** Sandbox ID */
	sandboxId: z.string().describe('Sandbox ID'),
	/** Exit code from the process */
	exitCode: z.number().describe('Exit code from the process'),
	/** Duration in milliseconds */
	durationMs: z.number().describe('Duration in milliseconds'),
	/** Stdout content (if captured) */
	stdout: z.string().optional().describe('Stdout content (if captured)'),
	/** Stderr content (if captured) */
	stderr: z.string().optional().describe('Stderr content (if captured)'),
});
export type SandboxRunResult = z.infer<typeof SandboxRunResultSchema>;

/**
 * Sandbox service for creating and managing isolated execution environments
 */
export interface SandboxService {
	run(options: SandboxRunOptions): Promise<SandboxRunResult>;
	create(options?: SandboxCreateOptions): Promise<Sandbox>;
	/** Get a full Sandbox instance for an existing sandbox by ID. */
	connect(sandboxId: string): Promise<Sandbox>;
	get(sandboxId: string): Promise<SandboxInfo>;
	list(params?: ListSandboxesParams): Promise<ListSandboxesResponse>;
	destroy(sandboxId: string): Promise<void>;
	/** Pause a running sandbox, creating a checkpoint of its current state. */
	pause(sandboxId: string): Promise<void>;
	/** Resume a paused or evacuated sandbox from its checkpoint. */
	resume(sandboxId: string): Promise<void>;
	snapshot: SnapshotService;
}

// ===== API Reference Schemas =====

/**
 * Request body for updating sandbox environment variables.
 */
export const SandboxEnvUpdateRequestSchema = z.object({
	/** Key-value pairs. Set value to null to delete a variable. */
	env: z
		.record(z.string(), z.string().nullable())
		.describe('Key-value pairs. Set value to null to delete a variable.'),
});
export type SandboxEnvUpdateRequest = z.infer<typeof SandboxEnvUpdateRequestSchema>;

/**
 * Response data for updating sandbox environment variables.
 */
export const SandboxEnvUpdateResponseSchema = z.object({
	/** Current environment after update */
	env: z.record(z.string(), z.string()).describe('Current environment after update'),
});
export type SandboxEnvUpdateResponse = z.infer<typeof SandboxEnvUpdateResponseSchema>;

/**
 * Response data for sandbox status check (mirrors private SandboxStatusDataSchema in getStatus.ts).
 */
export const SandboxStatusResponseDataSchema = z.object({
	/** Unique identifier for the sandbox */
	sandboxId: z.string().describe('Unique identifier for the sandbox.'),
	/** Current status of the sandbox */
	status: z.string().describe('Current status of the sandbox.'),
	/** Exit code from the last execution, if terminated */
	exitCode: z.number().optional().describe('Exit code from the last execution, if terminated.'),
});
export type SandboxStatusResponseData = z.infer<typeof SandboxStatusResponseDataSchema>;

/**
 * Request body for initializing a snapshot build (mirrors private _SnapshotBuildInitParamsSchema in snapshot.ts).
 */
export const SnapshotBuildInitRequestSchema = z.object({
	/** Runtime identifier (name:tag or runtime ID) */
	runtime: z.string().describe('Runtime identifier (name:tag or runtime ID)'),
	/** Display name for the snapshot */
	name: z.string().optional().describe('Display name for the snapshot'),
	/** Tag for the snapshot */
	tag: z.string().optional().describe('Tag for the snapshot'),
	/** Description of the snapshot */
	description: z.string().optional().describe('Description of the snapshot'),
	/** SHA-256 hash of snapshot content for change detection */
	contentHash: z
		.string()
		.optional()
		.describe('SHA-256 hash of snapshot content for change detection'),
	/** Force rebuild even if content is unchanged */
	force: z.boolean().optional().describe('Force rebuild even if content is unchanged'),
	/** Request encryption for the snapshot archive */
	encrypt: z.boolean().optional().describe('Request encryption for the snapshot archive'),
	/** Make snapshot public (enables virus scanning, disables encryption) */
	public: z
		.boolean()
		.optional()
		.describe('Make snapshot public (enables virus scanning, disables encryption)'),
});
export type SnapshotBuildInitRequest = z.infer<typeof SnapshotBuildInitRequestSchema>;

/**
 * Request body for finalizing a snapshot build (mirrors private _SnapshotBuildFinalizeParamsSchema in snapshot.ts).
 */
export const SnapshotBuildFinalizeRequestSchema = z.object({
	/** Total size of the snapshot in bytes */
	sizeBytes: z.number().describe('Total size of the snapshot in bytes'),
	/** Number of files in the snapshot */
	fileCount: z.number().describe('Number of files in the snapshot'),
	/** Array of file metadata */
	files: z.array(SnapshotFileInfoSchema).describe('Array of file metadata'),
	/** List of apt packages to install */
	dependencies: z.array(z.string()).optional().describe('List of apt packages to install'),
	/** List of npm/bun packages to install globally */
	packages: z
		.array(z.string())
		.optional()
		.describe('List of npm/bun packages to install globally'),
	/** Environment variables to set */
	env: z.record(z.string(), z.string()).optional().describe('Environment variables to set'),
	/** User-defined metadata key-value pairs */
	metadata: z
		.record(z.string(), z.string())
		.optional()
		.describe('User-defined metadata key-value pairs'),
});
export type SnapshotBuildFinalizeRequest = z.infer<typeof SnapshotBuildFinalizeRequestSchema>;

/**
 * Request body for updating a snapshot tag.
 */
export const SnapshotTagUpdateRequestSchema = z.object({
	/** New tag or null to remove tag */
	tag: z.string().nullable().describe('New tag or null to remove tag'),
});
export type SnapshotTagUpdateRequest = z.infer<typeof SnapshotTagUpdateRequestSchema>;

/** Structured error for sandbox operations */
export const SandboxError = StructuredError('SandboxError')<{
	sandboxId?: string;
	executionId?: string;
}>();
