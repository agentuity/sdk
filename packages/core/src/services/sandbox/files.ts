import { z } from 'zod';
import { APIClient } from '../api.ts';
import { SandboxResponseError, throwSandboxError } from './util.ts';
import type { FileToWrite } from './types.ts';

export const FileToWriteSchema = z.object({
	path: z.string().describe('Path to the file relative to the sandbox workspace'),
	content: z.string().describe('Base64-encoded file content'),
});

export const WriteFilesRequestSchema = z
	.object({
		files: z.array(FileToWriteSchema).describe('Array of files to write'),
	})
	.describe('Request body for writing files to a sandbox');

export const WriteFilesDataSchema = z
	.object({
		filesWritten: z.number().describe('Number of files successfully written'),
	})
	.describe('Response data from writing files');

export const WriteFilesResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
		data: WriteFilesDataSchema.optional(),
		filesWritten: z.number().optional(),
	}),
]);

export const WriteFilesParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to write files into'),
	files: z.array(z.custom<FileToWrite>()).describe('Files to write to the sandbox workspace'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type WriteFilesParams = z.infer<typeof WriteFilesParamsSchema>;
export type WriteFilesResult = z.infer<typeof WriteFilesDataSchema>;

/**
 * Writes files to a sandbox workspace.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and files to write
 * @returns The result including number of files written
 * @throws {SandboxResponseError} If the write request fails
 */
export async function sandboxWriteFiles(
	client: APIClient,
	params: WriteFilesParams
): Promise<WriteFilesResult> {
	const { sandboxId, files, orgId, signal } = params;

	const body: z.infer<typeof WriteFilesRequestSchema> = {
		files: files.map((f) => ({
			path: f.path,
			content: f.content.toString('base64'),
		})),
	};

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof WriteFilesResponseSchema>>(
		url,
		body,
		WriteFilesResponseSchema,
		WriteFilesRequestSchema,
		signal
	);

	if (resp.success) {
		return {
			filesWritten: resp.data?.filesWritten ?? resp.filesWritten ?? 0,
		};
	}

	throwSandboxError(resp, { sandboxId });
}

export const ReadFileParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to read a file from'),
	path: z.string().describe('Path to the file to read'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type ReadFileParams = z.infer<typeof ReadFileParamsSchema>;

/**
 * Reads a file from a sandbox workspace.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and file path
 * @returns A ReadableStream of the file contents
 * @throws {SandboxResponseError} If the read request fails
 */
export async function sandboxReadFile(
	client: APIClient,
	params: ReadFileParams
): Promise<ReadableStream<Uint8Array>> {
	const { sandboxId, path, orgId, signal } = params;

	const queryParams = new URLSearchParams();
	queryParams.set('path', path);
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/${sandboxId}?${queryString}`;

	const response = await client.rawGet(url, signal);
	const sessionId = response.headers.get('x-session-id');

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to read file: ${response.status} ${text}`,
			sandboxId,
			sessionId,
		});
	}

	if (!response.body) {
		throw new SandboxResponseError({
			message: 'No response body',
			sandboxId,
			sessionId,
		});
	}

	return response.body;
}

export const MkDirRequestSchema = z
	.object({
		path: z.string().describe('Path to the directory to create'),
		recursive: z.boolean().optional().describe('Create parent directories if needed'),
	})
	.describe('Request body for creating a directory');

export const MkDirResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export const MkDirParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID where directory should be created'),
	path: z.string().describe('Directory path to create'),
	recursive: z.boolean().optional().describe('Create parent directories when true'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type MkDirParams = z.infer<typeof MkDirParamsSchema>;

/**
 * Creates a directory in a sandbox workspace.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID, path, and recursive flag
 * @throws {SandboxResponseError} If the mkdir request fails
 */
export async function sandboxMkDir(client: APIClient, params: MkDirParams): Promise<void> {
	const { sandboxId, path, recursive, orgId, signal } = params;

	const body: z.infer<typeof MkDirRequestSchema> = {
		path,
		recursive: recursive ?? false,
	};

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/mkdir/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof MkDirResponseSchema>>(
		url,
		body,
		MkDirResponseSchema,
		MkDirRequestSchema,
		signal
	);

	if (!resp.success) {
		throwSandboxError(resp, { sandboxId });
	}
}

export const RmDirRequestSchema = z
	.object({
		path: z.string().describe('Path to the directory to remove'),
		recursive: z.boolean().optional().describe('Remove directory and all contents'),
	})
	.describe('Request body for removing a directory');

export const RmDirResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export const RmDirParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID containing the directory to remove'),
	path: z.string().describe('Directory path to remove'),
	recursive: z.boolean().optional().describe('Remove directory contents recursively when true'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type RmDirParams = z.infer<typeof RmDirParamsSchema>;

/**
 * Removes a directory from a sandbox workspace.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID, path, and recursive flag
 * @throws {SandboxResponseError} If the rmdir request fails
 */
export async function sandboxRmDir(client: APIClient, params: RmDirParams): Promise<void> {
	const { sandboxId, path, recursive, orgId, signal } = params;

	const body: z.infer<typeof RmDirRequestSchema> = {
		path,
		recursive: recursive ?? false,
	};

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/rmdir/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof RmDirResponseSchema>>(
		url,
		body,
		RmDirResponseSchema,
		RmDirRequestSchema,
		signal
	);

	if (!resp.success) {
		throwSandboxError(resp, { sandboxId });
	}
}

export const RmFileRequestSchema = z
	.object({
		path: z.string().describe('Path to the file to remove'),
	})
	.describe('Request body for removing a file');

export const RmFileResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export const RmFileParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID containing the file to remove'),
	path: z.string().describe('File path to remove'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type RmFileParams = z.infer<typeof RmFileParamsSchema>;

/**
 * Removes a file from a sandbox workspace.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and path
 * @throws {SandboxResponseError} If the rm request fails
 */
export async function sandboxRmFile(client: APIClient, params: RmFileParams): Promise<void> {
	const { sandboxId, path, orgId, signal } = params;

	const body: z.infer<typeof RmFileRequestSchema> = {
		path,
	};

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/rm/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof RmFileResponseSchema>>(
		url,
		body,
		RmFileResponseSchema,
		RmFileRequestSchema,
		signal
	);

	if (!resp.success) {
		throwSandboxError(resp, { sandboxId });
	}
}

export const FileInfoSchema = z.object({
	path: z.string().describe('File path relative to the listed directory'),
	size: z.number().describe('File size in bytes'),
	isDir: z.boolean().describe('Whether the entry is a directory'),
	mode: z.string().describe('Unix permissions as octal string (e.g., "0644")'),
	modTime: z.string().describe('Modification time in RFC3339 format'),
});

export const ListFilesDataSchema = z.object({
	files: z.array(FileInfoSchema).describe('Array of file information'),
});

export const ListFilesResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
		data: ListFilesDataSchema,
	}),
]);

export type FileInfo = z.infer<typeof FileInfoSchema>;

export const ListFilesParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to list files from'),
	path: z.string().optional().describe('Optional directory path to list'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type ListFilesParams = z.infer<typeof ListFilesParamsSchema>;
export type ListFilesResult = z.infer<typeof ListFilesDataSchema>;

/**
 * Lists files in a sandbox workspace directory.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and optional path
 * @returns The list of files and directories
 * @throws {SandboxResponseError} If the list request fails
 */
export async function sandboxListFiles(
	client: APIClient,
	params: ListFilesParams
): Promise<ListFilesResult> {
	const { sandboxId, path, orgId, signal } = params;

	const queryParams = new URLSearchParams();
	if (path) {
		queryParams.set('path', path);
	}
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/list/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ListFilesResponseSchema>>(
		url,
		ListFilesResponseSchema,
		signal
	);

	if (resp.success) {
		return {
			files: resp.data.files,
		};
	}

	throwSandboxError(resp, { sandboxId });
}

export type ArchiveFormat = 'zip' | 'tar.gz';

export const DownloadArchiveParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to download archive contents from'),
	path: z.string().optional().describe('Optional path inside sandbox workspace to archive'),
	format: z.enum(['zip', 'tar.gz']).optional().describe('Archive format to return'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type DownloadArchiveParams = z.infer<typeof DownloadArchiveParamsSchema>;

/**
 * Downloads files from a sandbox as a compressed archive.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID, path, and format
 * @returns A ReadableStream of the archive contents
 * @throws {SandboxResponseError} If the download request fails
 */
export async function sandboxDownloadArchive(
	client: APIClient,
	params: DownloadArchiveParams
): Promise<ReadableStream<Uint8Array>> {
	const { sandboxId, path, format, orgId, signal } = params;

	const queryParams = new URLSearchParams();
	if (path) {
		queryParams.set('path', path);
	}
	if (format) {
		queryParams.set('format', format);
	}
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/download/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const response = await client.rawGet(url, signal);
	const sessionId = response.headers.get('x-session-id');

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to download archive: ${response.status} ${text}`,
			sandboxId,
			sessionId,
		});
	}

	if (!response.body) {
		throw new SandboxResponseError({
			message: 'No response body',
			sandboxId,
			sessionId,
		});
	}

	return response.body;
}

export const UploadArchiveParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID to upload archive contents to'),
	archive: z
		.union([
			z.custom<Uint8Array>((v) => v instanceof Uint8Array),
			z.instanceof(ArrayBuffer),
			z.custom<ReadableStream<Uint8Array>>((v) => v instanceof ReadableStream),
		])
		.describe('Archive bytes or stream to upload'),
	path: z.string().optional().describe('Optional destination path for archive extraction'),
	format: z
		.union([z.enum(['zip', 'tar.gz']), z.literal('')])
		.optional()
		.describe('Optional archive format hint'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type UploadArchiveParams = z.infer<typeof UploadArchiveParamsSchema>;

export const UploadArchiveResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

/**
 * Uploads a compressed archive to a sandbox and extracts it.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID, archive data, path, and optional format
 * @throws {SandboxResponseError} If the upload request fails
 */
export async function sandboxUploadArchive(
	client: APIClient,
	params: UploadArchiveParams
): Promise<void> {
	const { sandboxId, archive, path, format, orgId, signal } = params;

	const queryParams = new URLSearchParams();
	if (path) {
		queryParams.set('path', path);
	}
	if (format) {
		queryParams.set('format', format);
	}
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/fs/upload/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const response = await client.rawPost(url, archive, 'application/octet-stream', signal);
	const sessionId = response.headers.get('x-session-id');

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to upload archive: ${response.status} ${text}`,
			sandboxId,
			sessionId,
		});
	}

	const body = await response.json();
	const result = UploadArchiveResponseSchema.parse(body);

	if (!result.success) {
		throwSandboxError(result, { sandboxId, sessionId });
	}
}

export const SetEnvRequestSchema = z.object({
	env: z
		.record(z.string(), z.string().nullable())
		.describe('Environment variables to set (null to delete)'),
});

export const SetEnvDataSchema = z.object({
	env: z.record(z.string(), z.string()).describe('Current environment variables after update'),
});

export const SetEnvResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
		data: SetEnvDataSchema,
	}),
]);

export const SetEnvParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID where environment should be updated'),
	env: z.record(z.string(), z.string().nullable()).describe('Environment variable updates'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});

export type SetEnvParams = z.infer<typeof SetEnvParamsSchema>;
export type SetEnvResult = z.infer<typeof SetEnvDataSchema>;

/**
 * Sets environment variables on a sandbox. Pass null to delete a variable.
 *
 * @param client - The API client to use for the request
 * @param params - Parameters including sandbox ID and env key/value pairs
 * @returns The current environment variables after the update
 * @throws {SandboxResponseError} If the request fails
 */
export async function sandboxSetEnv(
	client: APIClient,
	params: SetEnvParams
): Promise<SetEnvResult> {
	const { sandboxId, env, orgId, signal } = params;

	const body: z.infer<typeof SetEnvRequestSchema> = { env };

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/env/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.patch<z.infer<typeof SetEnvResponseSchema>>(
		url,
		body,
		SetEnvResponseSchema,
		SetEnvRequestSchema,
		signal
	);

	if (resp.success) {
		return {
			env: resp.data.env,
		};
	}

	throwSandboxError(resp, { sandboxId });
}
