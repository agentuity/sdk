import { z } from 'zod';
import { APIClient } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { FileToWrite } from '@agentuity/core';

export const FileToWriteSchema = z.object({
	path: z.string().describe('Path to the file relative to the sandbox workspace'),
	content: z.string().describe('Base64-encoded file content'),
});

const WriteFilesRequestSchema = z
	.object({
		files: z.array(FileToWriteSchema).describe('Array of files to write'),
	})
	.describe('Request body for writing files to a sandbox');

const WriteFilesDataSchema = z
	.object({
		filesWritten: z.number().describe('Number of files successfully written'),
	})
	.describe('Response data from writing files');

const WriteFilesResponseSchema = z.discriminatedUnion('success', [
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

export interface WriteFilesParams {
	sandboxId: string;
	files: FileToWrite[];
	orgId?: string;
	signal?: AbortSignal;
}

export interface WriteFilesResult {
	filesWritten: number;
}

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
	const url = `/fs/${API_VERSION}/${sandboxId}${queryString ? `?${queryString}` : ''}`;

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

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}

export interface ReadFileParams {
	sandboxId: string;
	path: string;
	orgId?: string;
	signal?: AbortSignal;
}

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
	const url = `/fs/${API_VERSION}/${sandboxId}?${queryString}`;

	const response = await client.rawGet(url, signal);

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to read file: ${response.status} ${text}`,
			sandboxId,
		});
	}

	if (!response.body) {
		throw new SandboxResponseError({
			message: 'No response body',
			sandboxId,
		});
	}

	return response.body;
}

const MkDirRequestSchema = z
	.object({
		path: z.string().describe('Path to the directory to create'),
		recursive: z.boolean().optional().describe('Create parent directories if needed'),
	})
	.describe('Request body for creating a directory');

const MkDirResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export interface MkDirParams {
	sandboxId: string;
	path: string;
	recursive?: boolean;
	orgId?: string;
	signal?: AbortSignal;
}

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
	const url = `/fs/${API_VERSION}/mkdir/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof MkDirResponseSchema>>(
		url,
		body,
		MkDirResponseSchema,
		MkDirRequestSchema,
		signal
	);

	if (!resp.success) {
		throw new SandboxResponseError({ message: resp.message, sandboxId });
	}
}

const RmDirRequestSchema = z
	.object({
		path: z.string().describe('Path to the directory to remove'),
		recursive: z.boolean().optional().describe('Remove directory and all contents'),
	})
	.describe('Request body for removing a directory');

const RmDirResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export interface RmDirParams {
	sandboxId: string;
	path: string;
	recursive?: boolean;
	orgId?: string;
	signal?: AbortSignal;
}

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
	const url = `/fs/${API_VERSION}/rmdir/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof RmDirResponseSchema>>(
		url,
		body,
		RmDirResponseSchema,
		RmDirRequestSchema,
		signal
	);

	if (!resp.success) {
		throw new SandboxResponseError({ message: resp.message, sandboxId });
	}
}

const RmFileRequestSchema = z
	.object({
		path: z.string().describe('Path to the file to remove'),
	})
	.describe('Request body for removing a file');

const RmFileResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
	}),
]);

export interface RmFileParams {
	sandboxId: string;
	path: string;
	orgId?: string;
	signal?: AbortSignal;
}

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
	const url = `/fs/${API_VERSION}/rm/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof RmFileResponseSchema>>(
		url,
		body,
		RmFileResponseSchema,
		RmFileRequestSchema,
		signal
	);

	if (!resp.success) {
		throw new SandboxResponseError({ message: resp.message, sandboxId });
	}
}

const FileInfoSchema = z.object({
	path: z.string().describe('File path relative to the listed directory'),
	size: z.number().describe('File size in bytes'),
	isDir: z.boolean().describe('Whether the entry is a directory'),
	mode: z.string().describe('Unix permissions as octal string (e.g., "0644")'),
	modTime: z.string().describe('Modification time in RFC3339 format'),
});

const ListFilesDataSchema = z.object({
	files: z.array(FileInfoSchema).describe('Array of file information'),
});

const ListFilesResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
		data: ListFilesDataSchema,
	}),
]);

export interface FileInfo {
	path: string;
	size: number;
	isDir: boolean;
	mode: string;
	modTime: string;
}

export interface ListFilesParams {
	sandboxId: string;
	path?: string;
	orgId?: string;
	signal?: AbortSignal;
}

export interface ListFilesResult {
	files: FileInfo[];
}

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
	const url = `/fs/${API_VERSION}/list/${sandboxId}${queryString ? `?${queryString}` : ''}`;

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

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}

export type ArchiveFormat = 'zip' | 'tar.gz';

export interface DownloadArchiveParams {
	sandboxId: string;
	path?: string;
	format?: ArchiveFormat;
	orgId?: string;
	signal?: AbortSignal;
}

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
	const url = `/fs/${API_VERSION}/download/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const response = await client.rawGet(url, signal);

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to download archive: ${response.status} ${text}`,
			sandboxId,
		});
	}

	if (!response.body) {
		throw new SandboxResponseError({
			message: 'No response body',
			sandboxId,
		});
	}

	return response.body;
}

export interface UploadArchiveParams {
	sandboxId: string;
	archive: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;
	path?: string;
	format?: ArchiveFormat | '';
	orgId?: string;
	signal?: AbortSignal;
}

const UploadArchiveResponseSchema = z.discriminatedUnion('success', [
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
	const url = `/fs/${API_VERSION}/upload/${sandboxId}${queryString ? `?${queryString}` : ''}`;

	const response = await client.rawPost(url, archive, 'application/octet-stream', signal);

	if (!response.ok) {
		const text = await response.text().catch(() => 'Unknown error');
		throw new SandboxResponseError({
			message: `Failed to upload archive: ${response.status} ${text}`,
			sandboxId,
		});
	}

	const body = await response.json();
	const result = UploadArchiveResponseSchema.parse(body);

	if (!result.success) {
		throw new SandboxResponseError({ message: result.message, sandboxId });
	}
}

const SetEnvRequestSchema = z.object({
	env: z
		.record(z.string(), z.string().nullable())
		.describe('Environment variables to set (null to delete)'),
});

const SetEnvDataSchema = z.object({
	env: z.record(z.string(), z.string()).describe('Current environment variables after update'),
});

const SetEnvResponseSchema = z.discriminatedUnion('success', [
	z.object({
		success: z.literal<false>(false),
		message: z.string().describe('the error message'),
	}),
	z.object({
		success: z.literal<true>(true),
		data: SetEnvDataSchema,
	}),
]);

export interface SetEnvParams {
	sandboxId: string;
	env: Record<string, string | null>;
	orgId?: string;
	signal?: AbortSignal;
}

export interface SetEnvResult {
	env: Record<string, string>;
}

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
	const url = `/sandbox/env/${API_VERSION}/${sandboxId}${queryString ? `?${queryString}` : ''}`;

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

	throw new SandboxResponseError({ message: resp.message, sandboxId });
}
