import { SandboxCreateDataSchema, SandboxCreateRequestSchema } from './create.ts';
import { DiskCheckpointCreateParamsSchema, DiskCheckpointInfoSchema } from './disk-checkpoint.ts';
import { ExecuteDataSchema, ExecuteRequestSchema } from './execute.ts';
import {
	ListFilesDataSchema,
	MkDirRequestSchema,
	RmDirRequestSchema,
	RmFileRequestSchema,
	WriteFilesDataSchema,
	WriteFilesRequestSchema,
} from './files.ts';
import { SandboxResolveDataSchema } from './resolve.ts';
import { SnapshotBuildInitResponseSchema } from './snapshot.ts';
import {
	ListRuntimesResponseSchema,
	ListSandboxesResponseSchema,
	SandboxEnvUpdateRequestSchema,
	SandboxEnvUpdateResponseSchema,
	SandboxStatusResponseDataSchema,
	SnapshotBuildFinalizeRequestSchema,
	SnapshotBuildInitRequestSchema,
	SnapshotCreateOptionsSchema,
	SnapshotListResponseSchema,
	SnapshotTagUpdateRequestSchema,
} from './types.ts';
import type { Service } from '../api-reference.ts';

const service: Service = {
	name: 'Sandboxes',
	slug: 'sandboxes',
	description:
		'Create and manage isolated execution environments with full lifecycle, file system, snapshot, and checkpoint support',
	hasPublicEndpoints: true,
	endpoints: [
		// ── Sandbox Management ────────────────────────────────────────────
		{
			id: 'create-sandbox',
			title: 'Create Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox',
			description: 'Create a new sandbox execution environment.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Sandbox creation payload.',
				fields: { schema: SandboxCreateRequestSchema },
			},
			responseDescription:
				'Returns the sandbox ID, status, and optional stream URLs for stdout/stderr.',
			responseFields: { schema: SandboxCreateDataSchema },
			statuses: [
				{ code: 201, description: 'Sandbox created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox',
			exampleBody: {
				name: 'dev-sandbox',
				runtime: 'node-20',
				resources: { memory: 512 },
				env: { NODE_ENV: 'development' },
			},
		},
		{
			id: 'list-sandboxes',
			title: 'List Sandboxes',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox',
			description: 'List sandboxes with optional filtering and pagination.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{ name: 'name', type: 'string', description: 'Filter by name', required: false },
				{ name: 'mode', type: 'string', description: 'Filter by mode', required: false },
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{ name: 'status', type: 'string', description: 'Filter by status', required: false },
				{
					name: 'live',
					type: 'boolean',
					description: 'Only running sandboxes',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
				{
					name: 'deletedOnly',
					type: 'boolean',
					description: 'Only deleted sandboxes',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of sandboxes.',
			responseFields: { schema: ListSandboxesResponseSchema },
			statuses: [
				{ code: 200, description: 'Sandboxes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox',
		},
		{
			id: 'get-sandbox',
			title: 'Get Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox/{sandboxId}',
			description: 'Retrieve a specific sandbox by ID.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'includeDeleted',
					type: 'boolean',
					description: 'Include deleted sandboxes',
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns full sandbox details including resources, runtime, network, timeout, and usage metrics.',
			statuses: [
				{ code: 200, description: 'Sandbox returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123',
		},
		{
			id: 'destroy-sandbox',
			title: 'Destroy Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'DELETE',
			path: '/sandbox/{sandboxId}',
			description: 'Destroy a sandbox and release all resources.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Destroys the sandbox and releases all resources.',
			statuses: [
				{ code: 200, description: 'Sandbox destroyed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123',
		},
		{
			id: 'get-sandbox-status',
			title: 'Get Sandbox Status',
			sectionTitle: 'Sandbox Management',
			method: 'GET',
			path: '/sandbox/status/{sandboxId}',
			description: 'Lightweight status check backed by Redis (~1ms). Optimized for polling.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the sandbox status.',
			responseFields: { schema: SandboxStatusResponseDataSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Status returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/status/sbx_abc123',
		},
		{
			id: 'pause-sandbox',
			title: 'Pause Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox/{sandboxId}/pause',
			description: 'Pause a running sandbox and create a checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Pauses the sandbox and creates a checkpoint.',
			statuses: [
				{ code: 200, description: 'Sandbox paused' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/pause',
		},
		{
			id: 'resume-sandbox',
			title: 'Resume Sandbox',
			sectionTitle: 'Sandbox Management',
			method: 'POST',
			path: '/sandbox/{sandboxId}/resume',
			description: 'Resume a paused sandbox from its checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Resumes a paused sandbox from its checkpoint.',
			statuses: [
				{ code: 200, description: 'Sandbox resumed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/resume',
		},
		{
			id: 'update-sandbox-env',
			title: 'Update Environment',
			sectionTitle: 'Sandbox Management',
			method: 'PATCH',
			path: '/sandbox/env/{sandboxId}',
			description:
				'Update environment variables for a sandbox. Set a value to null to delete a variable.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Environment variable updates.',
				fields: { schema: SandboxEnvUpdateRequestSchema },
			},
			responseDescription: 'Returns the current environment after update.',
			responseFields: { schema: SandboxEnvUpdateResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Environment updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/env/sbx_abc123',
			exampleBody: { env: { NODE_ENV: 'production', OLD_VAR: null } },
		},
		// ── Execution ─────────────────────────────────────────────────────
		{
			id: 'execute-command',
			title: 'Execute Command',
			sectionTitle: 'Execution',
			method: 'POST',
			path: '/sandbox/{sandboxId}/execute',
			description: 'Execute a command in a sandbox.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Command execution payload.',
				fields: { schema: ExecuteRequestSchema },
			},
			responseDescription:
				'Returns execution ID and stream URLs. If the sandbox was suspended, it is automatically resumed and the response includes `autoResumed: true`. Returns 409 if sandbox is busy.',
			responseFields: { schema: ExecuteDataSchema },
			statuses: [
				{
					code: 200,
					description:
						'Command executed (may include autoResumed: true if sandbox was suspended)',
				},
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
				{ code: 409, description: 'Conflict — sandbox is busy with another execution' },
			],
			examplePath: '/sandbox/sbx_abc123/execute',
			exampleBody: { command: ['node', '-e', "console.log('hello')"] },
		},
		{
			id: 'get-execution',
			title: 'Get Execution',
			sectionTitle: 'Execution',
			method: 'GET',
			path: '/sandbox/execution/{executionId}',
			description: 'Retrieve execution details. Use the `wait` parameter for long-polling.',
			pathParams: [
				{ name: 'executionId', type: 'string', description: 'Execution ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'wait',
					type: 'string',
					description:
						"Long-poll duration (e.g., '60s', '5m'). Server holds connection until execution completes or timeout.",
					required: false,
				},
			],
			requestBody: null,
			responseDescription:
				'Returns execution details. Use the `wait` parameter for long-polling.',
			statuses: [
				{ code: 200, description: 'Execution returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Execution not found' },
			],
			examplePath: '/sandbox/execution/exec_abc123',
		},
		{
			id: 'list-executions',
			title: 'List Executions',
			sectionTitle: 'Execution',
			method: 'GET',
			path: '/sandbox/sandboxes/{sandboxId}/executions',
			description: 'List executions for a specific sandbox.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
			],
			requestBody: null,
			responseDescription: 'Returns list of executions for the sandbox.',
			statuses: [
				{ code: 200, description: 'Executions returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sandboxes/sbx_abc123/executions',
		},
		// ── File System ───────────────────────────────────────────────────
		{
			id: 'write-files',
			title: 'Write Files',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/{sandboxId}',
			description: 'Write one or more files to the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Files to write.',
				fields: { schema: WriteFilesRequestSchema },
			},
			responseDescription: 'Returns the number of files written.',
			responseFields: { schema: WriteFilesDataSchema },
			statuses: [
				{ code: 200, description: 'Files written' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/sbx_abc123',
			exampleBody: {
				files: [{ path: '/app/index.js', content: 'Y29uc29sZS5sb2coJ2hlbGxvJyk=' }],
			},
		},
		{
			id: 'read-file',
			title: 'Read File',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/{sandboxId}',
			description: 'Read a file from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'File path to read', required: true },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the raw file contents as a stream.',
			statuses: [
				{ code: 200, description: 'File contents returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or file not found' },
			],
			examplePath: '/fs/sbx_abc123?path=/home/user/file.txt',
		},
		{
			id: 'create-directory',
			title: 'Create Directory',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/mkdir/{sandboxId}',
			description: 'Create a directory in the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Directory creation payload.',
				fields: { schema: MkDirRequestSchema },
			},
			responseDescription: 'Directory created successfully.',
			statuses: [
				{ code: 200, description: 'Directory created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/mkdir/sbx_abc123',
			exampleBody: { path: '/app/src', recursive: true },
		},
		{
			id: 'remove-directory',
			title: 'Remove Directory',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/rmdir/{sandboxId}',
			description: 'Remove a directory from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Directory removal payload.',
				fields: { schema: RmDirRequestSchema },
			},
			responseDescription: 'Directory removed successfully.',
			statuses: [
				{ code: 200, description: 'Directory removed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/rmdir/sbx_abc123',
			exampleBody: { path: '/app/tmp', recursive: true },
		},
		{
			id: 'remove-file',
			title: 'Remove File',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/rm/{sandboxId}',
			description: 'Remove a file from the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'File removal payload.',
				fields: { schema: RmFileRequestSchema },
			},
			responseDescription: 'File removed successfully.',
			statuses: [
				{ code: 200, description: 'File removed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/rm/sbx_abc123',
			exampleBody: { path: '/app/old-file.js' },
		},
		{
			id: 'list-files',
			title: 'List Files',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/list/{sandboxId}',
			description: 'List files in a sandbox directory.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Directory to list', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns list of files in the directory.',
			responseFields: { schema: ListFilesDataSchema },
			statuses: [
				{ code: 200, description: 'Files listed' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/list/sbx_abc123',
		},
		{
			id: 'download-archive',
			title: 'Download Archive',
			sectionTitle: 'File System',
			method: 'GET',
			path: '/fs/download/{sandboxId}',
			description: 'Download a compressed archive of the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Directory to archive', required: false },
				{ name: 'format', type: 'string', description: "'zip' or 'tar.gz'", required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns a streaming archive of the sandbox filesystem.',
			statuses: [
				{ code: 200, description: 'Archive returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/download/sbx_abc123',
		},
		{
			id: 'upload-archive',
			title: 'Upload Archive',
			sectionTitle: 'File System',
			method: 'POST',
			path: '/fs/upload/{sandboxId}',
			description:
				'Upload and extract a compressed archive to the sandbox. Send raw binary with Content-Type: application/octet-stream.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'path', type: 'string', description: 'Target directory', required: false },
				{ name: 'format', type: 'string', description: 'Archive format', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription:
				'Uploads and extracts a compressed archive to the sandbox. Send raw binary with Content-Type: application/octet-stream.',
			statuses: [
				{ code: 200, description: 'Archive uploaded and extracted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/fs/upload/sbx_abc123',
			exampleHeaders: { 'Content-Type': 'application/octet-stream' },
			exampleBody: '<binary archive data>',
		},
		// ── Snapshots ─────────────────────────────────────────────────────
		{
			id: 'create-snapshot',
			title: 'Create Snapshot',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/{sandboxId}/snapshot',
			description: 'Create a snapshot of the sandbox filesystem.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot creation payload.',
				fields: { schema: SnapshotCreateOptionsSchema },
			},
			responseDescription: 'Returns the created snapshot.',
			statuses: [
				{ code: 201, description: 'Snapshot created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/sandbox/sbx_abc123/snapshot',
			exampleBody: { name: 'baseline', tag: 'v1.0' },
		},
		{
			id: 'get-snapshot',
			title: 'Get Snapshot',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Retrieve a specific snapshot by ID.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns the snapshot object.',
			statuses: [
				{ code: 200, description: 'Snapshot returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
		},
		{
			id: 'list-snapshots',
			title: 'List Snapshots',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots',
			description: 'List snapshots with optional filtering and pagination.',
			pathParams: [],
			queryParams: [
				{
					name: 'sandboxId',
					type: 'string',
					description: 'Filter by sandbox',
					required: false,
				},
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of snapshots.',
			responseFields: { schema: SnapshotListResponseSchema },
			statuses: [
				{ code: 200, description: 'Snapshots returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots',
		},
		{
			id: 'delete-snapshot',
			title: 'Delete Snapshot',
			sectionTitle: 'Snapshots',
			method: 'DELETE',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Delete a snapshot.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Snapshot deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
		},
		{
			id: 'update-snapshot-tag',
			title: 'Update Snapshot Tag',
			sectionTitle: 'Snapshots',
			method: 'PATCH',
			path: '/sandbox/snapshots/{snapshotId}',
			description: 'Update the tag on a snapshot.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Tag update payload.',
				fields: { schema: SnapshotTagUpdateRequestSchema },
			},
			responseDescription: 'Returns the updated snapshot.',
			statuses: [
				{ code: 200, description: 'Snapshot tag updated' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123',
			exampleBody: { tag: 'v2.0' },
		},
		{
			id: 'get-snapshot-lineage',
			title: 'Get Snapshot Lineage',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/lineage',
			description: 'Get the ordered ancestry chain from a specified snapshot to root.',
			pathParams: [],
			queryParams: [
				{
					name: 'snapshot',
					type: 'string',
					description: 'Snapshot ID or name:tag',
					required: false,
				},
				{ name: 'name', type: 'string', description: 'Snapshot name', required: false },
				{ name: 'tag', type: 'string', description: 'Snapshot tag', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns ordered ancestry chain from specified snapshot to root.',
			statuses: [
				{ code: 200, description: 'Lineage returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots/lineage',
		},
		{
			id: 'get-public-snapshot',
			title: 'Get Public Snapshot',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/public/{snapshotRef}',
			description:
				'Retrieve a public snapshot by ID, full name (@slug/name:tag), or name:tag. No authentication required.',
			pathParams: [
				{
					name: 'snapshotRef',
					type: 'string',
					description: 'Snapshot ID, full name (@slug/name:tag), or name:tag',
					required: true,
				},
			],
			queryParams: [],
			requestBody: null,
			responseDescription: 'Returns public snapshot details. No authentication required.',
			statuses: [
				{ code: 200, description: 'Public snapshot returned' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/public/snp_abc123',
		},
		{
			id: 'list-public-snapshots',
			title: 'List Public Snapshots',
			sectionTitle: 'Snapshots',
			method: 'GET',
			path: '/sandbox/snapshots/public',
			description: 'List publicly available snapshots.',
			pathParams: [],
			queryParams: [
				{ name: 'limit', type: 'number', description: 'Max 100', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns paginated list of public snapshots.',
			responseFields: { schema: SnapshotListResponseSchema, stripRequired: true },
			statuses: [{ code: 200, description: 'Public snapshots returned' }],
			examplePath: '/sandbox/snapshots/public',
		},
		{
			id: 'initialize-snapshot-build',
			title: 'Initialize Snapshot Build',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/snapshots/build',
			description:
				'Initialize a snapshot build. Returns a presigned upload URL for the snapshot archive.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot build initialization payload.',
				fields: { schema: SnapshotBuildInitRequestSchema },
			},
			responseDescription:
				'Returns snapshot ID and presigned upload URL. If unchanged is true, content matches existing snapshot.',
			responseFields: { schema: SnapshotBuildInitResponseSchema, stripRequired: true },
			statuses: [
				{ code: 200, description: 'Build initialized' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/snapshots/build',
			exampleBody: { runtime: 'node-20', name: 'my-app', tag: 'latest' },
		},
		{
			id: 'finalize-snapshot-build',
			title: 'Finalize Snapshot Build',
			sectionTitle: 'Snapshots',
			method: 'POST',
			path: '/sandbox/snapshots/{snapshotId}/finalize',
			description: 'Finalize a snapshot build after uploading the archive.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Snapshot finalization payload.',
				fields: { schema: SnapshotBuildFinalizeRequestSchema },
			},
			responseDescription: 'Returns the finalized snapshot.',
			statuses: [
				{ code: 200, description: 'Snapshot finalized' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123/finalize',
			exampleBody: {
				sizeBytes: 1048576,
				fileCount: 42,
				files: [{ path: '/app/index.js', size: 1024 }],
			},
		},
		{
			id: 'upload-public-snapshot',
			title: 'Upload Public Snapshot',
			sectionTitle: 'Snapshots',
			method: 'PUT',
			path: '/sandbox/snapshots/{snapshotId}/upload',
			description:
				'Upload a gzip archive for public snapshots. Content-Type must be application/gzip. Includes virus scanning.',
			pathParams: [
				{ name: 'snapshotId', type: 'string', description: 'Snapshot ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription:
				'Uploads a gzip archive for public snapshots. Content-Type must be application/gzip. Includes virus scanning.',
			statuses: [
				{ code: 200, description: 'Snapshot uploaded' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Snapshot not found' },
			],
			examplePath: '/sandbox/snapshots/snp_abc123/upload',
			exampleHeaders: { 'Content-Type': 'application/gzip' },
			exampleBody: '<binary gzip data>',
		},
		// ── Disk Checkpoints ──────────────────────────────────────────────
		{
			id: 'create-checkpoint',
			title: 'Create Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'POST',
			path: '/sandbox/{sandboxId}/checkpoint',
			description:
				'Create a named checkpoint of the sandbox filesystem. Checkpoint names must be unique — creating a checkpoint with a name that already exists returns 409 Conflict. Disk checkpoints are persisted across pause/resume cycles.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: {
				description: 'Checkpoint creation payload.',
				fields: { schema: DiskCheckpointCreateParamsSchema, omit: ['sandboxId', 'orgId'] },
			},
			responseDescription: 'Returns the created checkpoint.',
			responseFields: { schema: DiskCheckpointInfoSchema },
			statuses: [
				{ code: 201, description: 'Checkpoint created' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
				{
					code: 409,
					description: 'Conflict — checkpoint name already exists, or sandbox is suspended',
				},
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint',
			exampleBody: { name: 'before-migration' },
		},
		{
			id: 'list-checkpoints',
			title: 'List Checkpoints',
			sectionTitle: 'Disk Checkpoints',
			method: 'GET',
			path: '/sandbox/checkpoints/{sandboxId}',
			description:
				'List checkpoints for a specific sandbox. Disk checkpoints are persisted across pause/resume cycles.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns list of checkpoints for the sandbox.',
			statuses: [
				{ code: 200, description: 'Checkpoints returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
				{ code: 409, description: 'Conflict — sandbox is suspended' },
			],
			examplePath: '/sandbox/checkpoints/sbx_abc123',
		},
		{
			id: 'restore-checkpoint',
			title: 'Restore Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'POST',
			path: '/sandbox/{sandboxId}/checkpoint/{checkpointId}/restore',
			description: 'Restore the sandbox filesystem to a checkpoint state.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
				{ name: 'checkpointId', type: 'string', description: 'Checkpoint ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Restores the sandbox filesystem to the checkpoint state.',
			statuses: [
				{ code: 200, description: 'Checkpoint restored' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or checkpoint not found' },
				{ code: 409, description: 'Conflict — sandbox is suspended' },
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint/ckpt_def456/restore',
		},
		{
			id: 'delete-checkpoint',
			title: 'Delete Checkpoint',
			sectionTitle: 'Disk Checkpoints',
			method: 'DELETE',
			path: '/sandbox/{sandboxId}/checkpoint/{checkpointId}',
			description: 'Delete a checkpoint.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
				{ name: 'checkpointId', type: 'string', description: 'Checkpoint ID', required: true },
			],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
			],
			requestBody: null,
			responseDescription: 'Empty response on success.',
			statuses: [
				{ code: 204, description: 'Checkpoint deleted' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox or checkpoint not found' },
				{ code: 409, description: 'Conflict — sandbox is suspended' },
			],
			examplePath: '/sandbox/sbx_abc123/checkpoint/ckpt_def456',
		},
		// ── Runtimes ──────────────────────────────────────────────────────
		{
			id: 'list-runtimes',
			title: 'List Runtimes',
			sectionTitle: 'Runtimes',
			method: 'GET',
			path: '/sandbox/runtimes',
			description: 'List available sandbox runtimes with their requirements.',
			pathParams: [],
			queryParams: [
				{ name: 'orgId', type: 'string', description: 'Organization ID', required: false },
				{
					name: 'limit',
					type: 'number',
					description: 'Maximum results to return',
					required: false,
				},
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
			],
			requestBody: null,
			responseDescription: 'Returns available sandbox runtimes with their requirements.',
			responseFields: { schema: ListRuntimesResponseSchema },
			statuses: [
				{ code: 200, description: 'Runtimes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/sandbox/runtimes',
		},
		// ── CLI Endpoints ─────────────────────────────────────────────────
		{
			id: 'cli-list-sandboxes',
			title: 'List Sandboxes (Cross-Org)',
			sectionTitle: 'CLI Endpoints',
			method: 'GET',
			path: '/cli/sandbox',
			description: 'List sandboxes across all organizations the user belongs to.',
			pathParams: [],
			queryParams: [
				{ name: 'name', type: 'string', description: 'Filter by name', required: false },
				{
					name: 'mode',
					type: 'string',
					description: "'oneshot' or 'interactive'",
					required: false,
				},
				{
					name: 'projectId',
					type: 'string',
					description: 'Filter by project',
					required: false,
				},
				{
					name: 'orgId',
					type: 'string',
					description: 'Filter by organization',
					required: false,
				},
				{ name: 'status', type: 'string', description: 'Filter by status', required: false },
				{ name: 'limit', type: 'number', description: 'Max 100', required: false },
				{ name: 'offset', type: 'number', description: 'Pagination offset', required: false },
				{ name: 'sort', type: 'string', description: 'Field to sort by', required: false },
				{ name: 'direction', type: 'string', description: 'Sort direction', required: false },
			],
			requestBody: null,
			responseDescription: 'Lists sandboxes across all organizations the user belongs to.',
			statuses: [
				{ code: 200, description: 'Sandboxes returned' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
			],
			examplePath: '/cli/sandbox',
		},
		{
			id: 'cli-resolve-sandbox',
			title: 'Resolve Sandbox',
			sectionTitle: 'CLI Endpoints',
			method: 'GET',
			path: '/cli/sandbox/{sandboxId}',
			description:
				'Resolve a sandbox ID to its org, region, and project. Used for cross-org sandbox lookup.',
			pathParams: [
				{ name: 'sandboxId', type: 'string', description: 'Sandbox ID', required: true },
			],
			queryParams: [],
			requestBody: null,
			responseDescription:
				'Resolves a sandbox ID to its org, region, and project. Used for cross-org sandbox lookup.',
			responseFields: { schema: SandboxResolveDataSchema },
			statuses: [
				{ code: 200, description: 'Sandbox resolved' },
				{ code: 401, description: 'Unauthorized — invalid or missing API key' },
				{ code: 404, description: 'Sandbox not found' },
			],
			examplePath: '/cli/sandbox/sbx_abc123',
		},
	],
};

export default service;
