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
